import { Address, BigInt, log, Bytes } from "@graphprotocol/graph-ts";
import {
  StateChange,
  EventParam,
  EventParams,
  Owner,
  Artwork,
  GlobalState,
  Token,
  TokenMaster,
  TokenController,
  User,
  TokenControlLever,
} from "../../generated/schema";
import { Contract } from "../../generated/Contract/Contract";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

////////////////////////////////////////
///// GLOBAL STATE /////////////////////
////////////////////////////////////////
export function getOrInitialiseGlobalState(
  asyncContract: Contract
): GlobalState | null {
  let globalState = GlobalState.load("MASTER");
  if (globalState == null) {
    globalState = new GlobalState("MASTER");
    globalState.latestMasterTokenId = BigInt.fromI32(0);
    globalState.currentExpectedTokenSupply = BigInt.fromI32(0);
    globalState.minBidIncreasePercent = asyncContract.minBidIncreasePercent();
    globalState.artistSecondSalePercentage = asyncContract.artistSecondSalePercentage();
    globalState.platformAddress = asyncContract.platformAddress();
  }
  return globalState;
}

export function refreshGlobalState(asyncContract: Contract): void {
  let globalState = GlobalState.load("MASTER");

  // Pull and set latest values from the contracts.
  // Set latestMasterTokenId
  globalState.currentExpectedTokenSupply = asyncContract.expectedTokenSupply();
  globalState.minBidIncreasePercent = asyncContract.minBidIncreasePercent();
  globalState.artistSecondSalePercentage = asyncContract.artistSecondSalePercentage();
  globalState.platformAddress = asyncContract.platformAddress();
  globalState.save();
}

////////////////////////////////////////
//////////// USER /////////////////////
////////////////////////////////////////
function createOrFetchUserBytes(userAddress: Bytes): User | null {
  let user = User.load(userAddress.toHexString());
  if (user == null) {
    user = new User(userAddress.toHexString());
  }

  return user;
}
function createOrFetchUserString(userAddress: string): User | null {
  let user = User.load(userAddress);
  if (user == null) {
    user = new User(userAddress);
  }

  return user;
}

/////////////////////////////////////////////
//////////// TOKEN HELPERS /////////////////
////////////////////////////////////////////

// Returns true if tokenCreatorsExist and were populated
export function populateTokenUniqueCreators(
  asyncContract: Contract,
  tokenId: BigInt
): boolean {
  let token = Token.load(tokenId.toString());
  if (token == null) {
    log.warning("This should be defined", []);
  }

  let index = 0;
  let tokenCreator = asyncContract.try_uniqueTokenCreators(
    tokenId,
    BigInt.fromI32(index)
  );

  {
    while (tokenCreator.reverted != true) {
      if (tokenCreator.value.toHexString() != ZERO_ADDRESS) {
        token.uniqueTokenCreators = token.uniqueTokenCreators.concat([
          tokenCreator.value,
        ]);
        index = index + 1;
        tokenCreator = asyncContract.try_uniqueTokenCreators(
          tokenId,
          BigInt.fromI32(index)
        );
      } else {
        break;
      }
    }
  }
  token.save();

  if (index > 0) {
    return true;
  } else {
    return false;
  }
}

export function getPermissionedAddress(
  asyncContract: Contract,
  tokenId: BigInt,
  owner: Bytes
): Bytes | null {
  let token = Token.load(tokenId.toString());
  if (token == null) {
    log.critical("This should be defined", []);
  }

  let permissionedAddress = asyncContract.try_permissionedControllers(
    owner as Address,
    tokenId
  );

  if (permissionedAddress.value.toHex() != ZERO_ADDRESS) {
    return permissionedAddress.value;
  } else {
    return null;
  }
}

/////////////////////////////////////////////
//////////// CREATE TOKENS /////////////////////
////////////////////////////////////////////

function createToken(
  tokenId: BigInt,
  isMasterToken: boolean,
  platformFirstSalePercentage: BigInt,
  platformSecondSalePercentage: BigInt,
  owner: string
): Token | null {
  let newUser = createOrFetchUserString(owner);

  let token = new Token(tokenId.toString());
  token.tokenId = tokenId;
  token.owner = newUser.id;
  token.isMaster = isMasterToken;
  token.platformFirstSalePercentage = platformFirstSalePercentage;
  token.platformSecondSalePercentage = platformSecondSalePercentage;
  token.currentBuyPrice = BigInt.fromI32(0);
  token.lastSalePrice = BigInt.fromI32(0);
  token.numberOfSales = BigInt.fromI32(0);
  token.tokenDidHaveFirstSale = false;
  return token;
}

function createMaster(
  tokenId: BigInt,
  platformFirstSalePercentage: BigInt,
  platformSecondSalePercentage: BigInt,
  owner: string,
  layers: BigInt
): Token | null {
  let masterToken = createToken(
    tokenId,
    true,
    platformFirstSalePercentage,
    platformSecondSalePercentage,
    owner
  );

  let tokenMasterObject = new TokenMaster(tokenId.toString() + "-Master");
  tokenMasterObject.layerCount = layers;
  tokenMasterObject.tokenDetails = masterToken.id;
  tokenMasterObject.save();

  masterToken.tokenMaster = tokenMasterObject.id;
  return masterToken;
}

function createController(
  tokenId: BigInt,
  platformFirstSalePercentage: BigInt,
  platformSecondSalePercentage: BigInt
): Token | null {
  let token = createToken(
    tokenId,
    false,
    platformFirstSalePercentage,
    platformSecondSalePercentage,
    ZERO_ADDRESS
  );

  let tokenControllerObject = new TokenController(
    tokenId.toString() + "-Controller"
  );
  tokenControllerObject.numControlLevers = BigInt.fromI32(0);
  tokenControllerObject.numRemainingUpdates = BigInt.fromI32(0);
  tokenControllerObject.isSetup = false;
  tokenControllerObject.tokenDetails = token.id;
  tokenControllerObject.save();

  token.tokenController = tokenControllerObject.id;
  return token;
}

export function createTokensFromMasterTokenId(
  asyncContract: Contract,
  tokenStart: BigInt,
  layers: BigInt,
  owner: string
): void {
  let platformFirstSalePercentage = asyncContract.platformFirstSalePercentages(
    tokenStart
  );
  let platformSecondSalePercentage = asyncContract.platformSecondSalePercentages(
    tokenStart
  );

  // Create the master token
  let masterToken = createMaster(
    tokenStart,
    platformFirstSalePercentage,
    platformSecondSalePercentage,
    owner,
    layers
  );
  masterToken.save();

  for (let index = 0; index < layers.toI32(); index++) {
    let tokenIdIndex = tokenStart.plus(BigInt.fromI32(index + 1));
    let token = createController(
      tokenIdIndex,
      platformFirstSalePercentage,
      platformSecondSalePercentage
    );
    token.save();
  }
}
//////////////////////////////////////////////////
//////////// LOAD TOKEN HOOK /////////////////////
//////////////////////////////////////////////////

// Trade off - do we have different initialization token functions
// for different events for effciency?
// Certain events being fired will give us certain garuntees etc.
export function getOrInitialiseToken(
  asyncContract: Contract,
  tokenId: BigInt
): Token | null {
  // If it exists, could be just whitelisted, or minting / control setup could have happened.
  // Depending on what type of token it is.
  let token = Token.load(tokenId.toString());
  if (token == null) {
    // This logic will only execute the first time we become aware of a v1 token!
    // Or when a token does not yet exist or whitelisted

    // First check if token actually exists
    // Rare case 1: Could be a token that doesn't at all exist if i.e. grantControlPermission called.
    let tokenCreator = asyncContract.try_uniqueTokenCreators(
      tokenId,
      BigInt.fromI32(0)
    );
    if (tokenCreator.reverted) {
      log.warning("Token does not exist and not whitelisted!", []);
      return null;
    }

    // otherwise it exists lets create the token depending on what type of token it is.
    // Will this error or have defaults.
    let data = asyncContract.try_controlTokenMapping(tokenId);

    // If its a control token
    if (data.value.value2) {
      // control token
      token = createController(tokenId, BigInt.fromI32(0), BigInt.fromI32(0));
    } else {
      //otherwise intialize a master token
      token = createMaster(
        tokenId,
        BigInt.fromI32(0),
        BigInt.fromI32(0),
        ZERO_ADDRESS, // need to get and set owner!
        BigInt.fromI32(0) // get layers sometime!!!!
      );
    }
    token.save();

    populateTokenUniqueCreators(asyncContract, tokenId);

    // Populate the rest
    token = populateTokenHelper(asyncContract, tokenId, token);
  } else {
    // If its already been pulled and set up, just return it! First most common case!
    // If its creator is populated, that means it has been minted and set up
    // Id master token is set up
    if (token.isMaster) {
      if (token.uniqueTokenCreators != null) {
        return token;
      }
      let hasBeenMinted = populateTokenUniqueCreators(asyncContract, tokenId);
      if (!hasBeenMinted) {
        log.warning("Token is ONLY whitelisted!", []);
        return token;
      }
    } else {
      let controlToken = TokenController.load(
        tokenId.toString() + "-Controller"
      );
      if (controlToken.isSetup) {
        return token;
      }

      let data = asyncContract.try_controlTokenMapping(tokenId);
      if (!data.value.value3) {
        return token;
      }

      populateTokenUniqueCreators(asyncContract, tokenId);
    }

    // Populate token data
    token = populateTokenHelper(asyncContract, tokenId, token);
  }

  // Refresh first sale requirement!? Incase waivered function called?
  return token;
}

function populateTokenHelper(
  asyncContract: Contract,
  tokenId: BigInt,
  token: Token | null
): Token | null {
  // Populate owner
  let currentOwner = asyncContract.try_ownerOf(tokenId);
  let user: User | null;
  if (currentOwner.reverted) {
    log.critical("Owner should be defined", []);
    user = createOrFetchUserString(ZERO_ADDRESS);
  } else {
    // TODO: Owner may not be creator for V1 tokens caution!
    user = createOrFetchUserBytes(currentOwner.value);
  }

  token.owner = user.id;
  user.save();

  token.platformFirstSalePercentage = asyncContract.platformFirstSalePercentages(
    tokenId
  );
  token.platformSecondSalePercentage = asyncContract.platformSecondSalePercentages(
    tokenId
  );
  token.tokenDidHaveFirstSale = asyncContract.tokenDidHaveFirstSale(tokenId);

  // token.permissionedAddress = getPermissionedAddress(
  //   asyncContract,
  //   tokenId,
  //   currentOwner.value // cast to bytes
  // );

  // Populate currentBid ->NOTE THIS will be populated by handler. No need to pull
  // Populate current buy price -> NOTE THIS will be populated by handler. No need to pull
  // Last sale price -> Cannot populate
  // Number of sales -> Cannot populate
  // Unique token creators -> All ready populated by populateTokenUniqueCreators function.

  if (token.isMaster) {
    pullAndSaveMasterTokenData(asyncContract, tokenId);
  } else {
    pullAndSaveControlTokenData(asyncContract, tokenId);
    pullAndSaveLevers(asyncContract, tokenId);
  }

  return token;
}

function pullAndSaveControlTokenData(
  asyncContract: Contract,
  tokenId: BigInt
): void {
  let controllerToken = TokenController.load(
    tokenId.toString() + "-Controller"
  );
  if (controllerToken == null) {
    log.critical("This should be defined", []);
  }
  // Will this revert if mapping does not exist
  let data = asyncContract.try_controlTokenMapping(tokenId);

  controllerToken.numControlLevers = data.value.value0;
  controllerToken.numRemainingUpdates = data.value.value1;
  controllerToken.isSetup = data.value.value3;

  controllerToken.save();
}

function pullAndSaveLevers(asyncContract: Contract, tokenId: BigInt): void {
  // all our data
  let data = asyncContract.getControlToken(tokenId);
  let leverId = BigInt.fromI32(0);

  for (let i = 0; i < data.length; i = i + 3) {
    let lever = getOrInitialiseLever(asyncContract, tokenId, leverId);

    lever.minValue = data[i];
    lever.maxValue = data[i + 1];
    lever.currentValue = data[i + 2];
    lever.save();

    leverId = leverId.plus(BigInt.fromI32(1));
  }
}

function pullAndSaveMasterTokenData(
  asyncContract: Contract,
  tokenId: BigInt
): void {
  let masterToken = TokenMaster.load(tokenId.toString() + "-Master");
  if (masterToken == null) {
    log.critical("This should be defined", []);
  }

  let data = asyncContract.try_creatorWhitelist(tokenId);

  masterToken.layerCount = data.value.value1;
  masterToken.save();
}

/////////////////////////////////////////////
//////////// NEW LEVERS /////////////////////
/////////////////////////////////////////////
export function getOrInitialiseLever(
  asyncContract: Contract,
  tokenId: BigInt,
  leverId: BigInt
): TokenControlLever | null {
  // TODO: Check if it is a control and not master token

  // levers only to be updated when control token is set up
  let lever = TokenControlLever.load(
    tokenId.toString() + "-" + leverId.toString()
  );
  if (lever == null) {
    lever = new TokenControlLever(
      tokenId.toString() + "-" + leverId.toString()
    );
    lever.minValue = BigInt.fromI32(0);
    lever.maxValue = BigInt.fromI32(0);
    lever.currentValue = BigInt.fromI32(0);
    lever.previousValue = BigInt.fromI32(0);
  }
  return lever;
}

////////////////////////////////////////
///// STATE CHANGE HELPERS /////////////
////////////////////////////////////////
export function getOrInitialiseStateChange(txId: string): StateChange | null {
  let stateChange = StateChange.load(txId);
  if (stateChange == null) {
    stateChange = new StateChange(txId);
    stateChange.txEventParamList = [];
    stateChange.ownerChanges = [];
    stateChange.artworkChanges = [];

    return stateChange;
  } else {
    return stateChange;
  }
}
function getEventIndex(txHash: Bytes): i32 {
  let stateChange = StateChange.load(txHash.toHex());
  if (stateChange == null) {
    return 0;
  }
  return stateChange.txEventParamList.length;
}
function createEventParams(
  txHash: Bytes,
  argValues: Array<string>,
  argNames: Array<string>,
  argTypes: Array<string>
): Array<string> {
  let eventIndex: i32 = getEventIndex(txHash);
  let eventParamsArr: Array<string> = [];
  for (let index = 0; index < argValues.length; index++) {
    let eventParamFund = new EventParam(
      txHash.toHex() + "-" + eventIndex.toString() + "-" + index.toString()
    );
    eventParamFund.index = index;
    eventParamFund.param = argValues[index];
    eventParamFund.paramName = argNames[index];
    eventParamFund.paramType = argTypes[index];
    eventParamFund.save();
    eventParamsArr.push(eventParamFund.id);
  }
  return eventParamsArr;
}
function txEventParamsHelper(
  eventName: string,
  eventIndex: i32,
  eventTxHash: Bytes,
  eventParamsArr: Array<string>
): EventParams {
  let eventParams = new EventParams(
    eventTxHash.toHex() + "-" + eventIndex.toString()
  );
  eventParams.index = eventIndex;
  eventParams.eventName = eventName;
  eventParams.params = eventParamsArr;
  eventParams.save();
  return eventParams;
}
function txStateChangeHelper(
  txHash: Bytes,
  timeStamp: BigInt,
  blockNumber: BigInt,
  eventName: string,
  eventParamArray: Array<string>,
  changedOwners: string[],
  changedArtworks: string[],
  contractVersion: i32
): void {
  let stateChange = getOrInitialiseStateChange(txHash.toHex());
  if (stateChange == null) {
    stateChange = new StateChange(txHash.toHex());
    stateChange.txEventParamList = [];
  }
  let eventIndex: i32 = getEventIndex(txHash);
  // create EventParams
  let eventParams = txEventParamsHelper(
    eventName,
    eventIndex,
    txHash,
    eventParamArray
  );
  stateChange.timestamp = timeStamp;
  stateChange.blockNumber = blockNumber;
  stateChange.txEventParamList = stateChange.txEventParamList.concat([
    eventParams.id,
  ]);
  for (let i = 0, len = changedOwners.length; i < len; i++) {
    stateChange.ownerChanges =
      stateChange.ownerChanges.indexOf(changedOwners[i]) === -1
        ? stateChange.ownerChanges.concat([changedOwners[i]])
        : stateChange.ownerChanges;
  }
  for (let i = 0, len = changedArtworks.length; i < len; i++) {
    stateChange.artworkChanges =
      stateChange.artworkChanges.indexOf(changedArtworks[i]) === -1
        ? stateChange.artworkChanges.concat([changedArtworks[i]])
        : stateChange.artworkChanges;
  }
  stateChange.contractVersion = contractVersion;
  stateChange.save();
}
export function saveEventToStateChange(
  txHash: Bytes,
  timestamp: BigInt,
  blockNumber: BigInt,
  eventName: string,
  parameterValues: Array<string>,
  parameterNames: Array<string>,
  parameterTypes: Array<string>,
  changedOwners: string[],
  changedArtworks: string[],
  version: i32
): void {
  let eventParamsArr: Array<string> = createEventParams(
    txHash,
    parameterValues,
    parameterNames,
    parameterTypes
  );
  txStateChangeHelper(
    txHash,
    timestamp,
    blockNumber,
    eventName,
    eventParamsArr,
    changedOwners,
    changedArtworks,
    version
  );
}
