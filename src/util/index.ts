import { Address, BigInt, log, Bytes } from "@graphprotocol/graph-ts";
import {
  StateChange,
  EventParam,
  EventParams,
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
    globalState.totalSaleAmount = BigInt.fromI32(0);
    globalState.tokenMasterIDs = [BigInt.fromI32(0)];
    globalState.currentExpectedTokenSupply = asyncContract.expectedTokenSupply();
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
  return createOrFetchUserString(userAddress.toHexString());
}

export function createOrFetchUserString(userAddress: string): User | null {
  let user = User.load(userAddress);
  if (user == null) {
    user = new User(userAddress);
    user.isArtist = false;
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
        // Get the user
        let user = createOrFetchUserBytes(tokenCreator.value);
        token.uniqueTokenCreators =
          token.uniqueTokenCreators.indexOf(user.id) === -1
            ? token.uniqueTokenCreators.concat([user.id])
            : token.uniqueTokenCreators;

        user.isArtist = true;
        if (token.isMaster) {
          user.createdMasters =
            user.createdMasters.indexOf(token.id + "-Master") === -1
              ? user.createdMasters.concat([token.id + "-Master"])
              : user.createdMasters;
        } else {
          user.createdControllers =
            user.createdControllers.indexOf(token.id + "-Controller") === -1
              ? user.createdControllers.concat([token.id + "-Controller"])
              : user.createdControllers;
        }
        user.save();

        // Try get next artist
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

export function trySetMasterLayersAndLinks(): void {
  let globalState = GlobalState.load("MASTER");
  let tokenMasters: Array<BigInt> = globalState.tokenMasterIDs;
  for (let j = 0; j < globalState.tokenMasterIDs.length; j++) {
    let tokenId: BigInt = tokenMasters[j];

    let token = Token.load(tokenId.toString());
    if (token == null) {
      if (tokenId.equals(BigInt.fromI32(0))) {
        log.info("Passing", []);
      } else {
        log.critical("This should be defined", []);
      }
    } else {
      let tokenMaster = TokenMaster.load(tokenId.toString() + "-Master");
      if (tokenMaster == null) {
        log.critical("This should be defined", []);
      }
      //log.warning("Population attempt", []);

      if (
        tokenMaster.layerCount.equals(
          BigInt.fromI32(tokenMaster.layers.length)
        ) &&
        tokenMaster.layerCount.gt(BigInt.fromI32(0))
      ) {
        log.warning("Already populated...", []);
        continue;
      }
      // Lets try populate if all the layers exist!
      let index = token.tokenId.plus(BigInt.fromI32(1));
      while (true) {
        let tokenController = TokenController.load(
          index.toString() + "-Controller"
        );
        if (tokenController == null) {
          let potentialMaster = TokenMaster.load(index.toString() + "-Master");
          if (potentialMaster == null) {
            log.warning(
              "Layer of master not upgraded. Cannot save layer count for master token: " +
                tokenMaster.id,
              []
            );
          } else {
            tokenMaster.layerCount = index
              .minus(tokenId)
              .minus(BigInt.fromI32(1));
          }
          tokenMaster.save();
          break;
        } else {
          tokenMaster.layers =
            tokenMaster.layers.indexOf(tokenController.id) === -1
              ? tokenMaster.layers.concat([tokenController.id])
              : tokenMaster.layers;
          tokenController.associatedMasterToken = tokenMaster.id;
          tokenController.save();
        }
        index = index.plus(BigInt.fromI32(1));
      }
    }
  }
}
/////////////////////////////////////////////
//////////// CREATE TOKENS /////////////////////
////////////////////////////////////////////

function createToken(
  tokenId: BigInt,
  isMasterToken: boolean,
  platformFirstSalePercentage: BigInt,
  platformSecondSalePercentage: BigInt
): Token | null {
  let token = new Token(tokenId.toString());
  token.tokenId = tokenId;
  token.isMaster = isMasterToken;
  token.platformFirstSalePercentage = platformFirstSalePercentage;
  token.platformSecondSalePercentage = platformSecondSalePercentage;
  token.currentBuyPrice = BigInt.fromI32(0);
  token.numberOfSales = BigInt.fromI32(0);
  token.tokenDidHaveFirstSale = false;
  return token;
}

function createMaster(
  asyncContract: Contract,
  tokenId: BigInt,
  platformFirstSalePercentage: BigInt,
  platformSecondSalePercentage: BigInt,
  layers: BigInt
): Token | null {
  let masterToken = createToken(
    tokenId,
    true,
    platformFirstSalePercentage,
    platformSecondSalePercentage
  );

  let globalState = getOrInitialiseGlobalState(asyncContract);
  globalState.tokenMasterIDs =
    globalState.tokenMasterIDs.indexOf(tokenId) === -1
      ? globalState.tokenMasterIDs.concat([tokenId])
      : globalState.tokenMasterIDs;
  globalState.save();

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
  platformSecondSalePercentage: BigInt,
  masterTokenId: BigInt = BigInt.fromI32(0)
): Token | null {
  let token = createToken(
    tokenId,
    false,
    platformFirstSalePercentage,
    platformSecondSalePercentage
  );

  let tokenControllerObject = new TokenController(
    tokenId.toString() + "-Controller"
  );
  tokenControllerObject.numControlLevers = BigInt.fromI32(0);
  tokenControllerObject.numRemainingUpdates = BigInt.fromI32(0);
  tokenControllerObject.numberOfUpdates = BigInt.fromI32(0);
  tokenControllerObject.isSetup = false;
  tokenControllerObject.tokenDetails = token.id;
  if (!masterTokenId.equals(BigInt.fromI32(0))) {
    tokenControllerObject.associatedMasterToken =
      masterTokenId.toString() + "-Master";
  }
  tokenControllerObject.save();

  token.tokenController = tokenControllerObject.id;
  return token;
}

export function createTokensFromMasterTokenId(
  asyncContract: Contract,
  tokenStart: BigInt,
  layers: BigInt
): void {
  let platformFirstSalePercentage = asyncContract.platformFirstSalePercentages(
    tokenStart
  );
  let platformSecondSalePercentage = asyncContract.platformSecondSalePercentages(
    tokenStart
  );

  // Create the master token
  let masterToken = createMaster(
    asyncContract,
    tokenStart,
    platformFirstSalePercentage,
    platformSecondSalePercentage,
    layers
  );
  masterToken.save();

  let masterTokenObject = TokenMaster.load(tokenStart.toString() + "-Master");

  for (let index = 0; index < layers.toI32(); index++) {
    let tokenIdIndex = tokenStart.plus(BigInt.fromI32(index + 1));
    let token = createController(
      tokenIdIndex,
      platformFirstSalePercentage,
      platformSecondSalePercentage,
      tokenStart
    );
    token.save();
    masterTokenObject.layers = masterTokenObject.layers.concat([
      tokenIdIndex.toString() + "-Controller",
    ]);
  }
  masterTokenObject.save();
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
  // Shift this check to only function that needs it
  let globalState = getOrInitialiseGlobalState(asyncContract);
  if (globalState.currentExpectedTokenSupply.lt(tokenId)) {
    // This can only really happen on permission function
    log.warning("SOMEONE CALLING STUFF ON NON_EXISTANT TOKEN!", []);
    return null;
  }

  // If it exists, could be just whitelisted, or minting / control setup could have happened.
  // Depending on what type of token it is.
  let token = Token.load(tokenId.toString());
  if (token == null) {
    // This logic will only execute the first time we become aware of a v1 token or normal token!

    // If this passes it means the associated master has been minted
    let tokenCreator = asyncContract.try_uniqueTokenCreators(
      tokenId,
      BigInt.fromI32(0)
    );
    if (tokenCreator.reverted) {
      // token is only whitelisted. If master, its not minted. If Controller master and itself both not minted
      // Handle this case! For now assume its only whitelisted!
      log.warning("Token is currently ONLY whitelisted", []);
      return null;
    }

    // otherwise it exists lets create the token depending on what type of token it is.
    // Checking if its a control or mater
    let data = asyncContract.controlTokenMapping(tokenId);
    let exists = data.value2;
    let isSetup = data.value3;

    // control token
    if (exists) {
      token = createController(tokenId, BigInt.fromI32(0), BigInt.fromI32(0));
      // If its only whitelisted, we have done out job
      if (!isSetup) {
        // Will have some creators
        populateTokenUniqueCreators(asyncContract, tokenId);
        return token;
      }
    } else {
      token = createMaster(
        asyncContract,
        tokenId,
        BigInt.fromI32(0),
        BigInt.fromI32(0),
        BigInt.fromI32(0)
      );
    }
    token.save();

    // since it must be minted!
    populateTokenUniqueCreators(asyncContract, tokenId);

    // Populate the rest of the token!
    token = populateTokenHelper(asyncContract, tokenId, token);
  } else {
    // ALREADY EXISTS> EITHER POPULATED, Or just whitelisted
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
    // control token is still only whitelisted.
  } else {
    user = createOrFetchUserBytes(currentOwner.value);
    token.owner = user.id;
    user.save();
  }

  token.platformFirstSalePercentage = asyncContract.platformFirstSalePercentages(
    tokenId
  );
  token.platformSecondSalePercentage = asyncContract.platformSecondSalePercentages(
    tokenId
  );
  token.tokenDidHaveFirstSale = asyncContract.tokenDidHaveFirstSale(tokenId);

  let uri = asyncContract.try_tokenURI(tokenId);
  if (uri.reverted) {
    log.warning("uri does not exist yet", []);
  } else {
    token.uri = uri.value;
  }

  token.permissionedAddress = getPermissionedAddress(
    asyncContract,
    tokenId,
    currentOwner.value // cast to bytes
  );

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
    lever.numberOfUpdates = BigInt.fromI32(0);
    let tokenController = TokenController.load(
      tokenId.toString() + "-Controller"
    );
    lever.layer = tokenController.id;
    tokenController.levers = tokenController.levers.concat([lever.id]);
    tokenController.save();
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
    stateChange.userChanges = [];
    stateChange.tokenChanges = [];

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
  changedTokens: string[],
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
    stateChange.userChanges =
      stateChange.userChanges.indexOf(changedOwners[i]) === -1
        ? stateChange.userChanges.concat([changedOwners[i]])
        : stateChange.userChanges;
  }
  for (let i = 0, len = changedTokens.length; i < len; i++) {
    stateChange.tokenChanges =
      stateChange.tokenChanges.indexOf(changedTokens[i]) === -1
        ? stateChange.tokenChanges.concat([changedTokens[i]])
        : stateChange.tokenChanges;
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
  changedTokens: string[],
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
    changedTokens,
    version
  );
}
