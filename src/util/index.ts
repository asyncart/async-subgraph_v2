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
//////////// NEW LEVERS /////////////////////
/////////////////////////////////////////////
export function getOrInitialiseLever(
  asyncContract: Contract,
  tokenId: BigInt,
  leverId: BigInt
): TokenControlLever | null {
  // TODO: Check if it is a control and not master token

  // let token = Token.load(tokenId.toString());
  // if (token == null) {
  //   log.critical("This should be defined", []);
  // }

  // Check it is setup

  // levers only to beupdated when control token is set up

  let lever = TokenControlLever.load(
    tokenId.toString() + "-" + leverId.toString()
  );
  if (lever == null) {
    lever = new TokenControlLever(
      tokenId.toString() + "-" + leverId.toString()
    );

    // Pull value from lever if set up!
    // THIS IS AN ISSUE: https://github.com/graphprotocol/graph-node/issues/2011
    // Mapping does not exist, TODO !
    let minValue = asyncContract.try_controlTokenMapping(tokenId);
  }

  return lever;
}

/////////////////////////////////////////////
//////////// NEW TOKENS /////////////////////
////////////////////////////////////////////
export function populateTokenUniqueCreators(
  asyncContract: Contract,
  tokenId: BigInt
): void {
  let token = Token.load(tokenId.toString());
  if (token == null) {
    log.critical("This should be defined", []);
  }

  let index = 0;
  let tokenCreator = asyncContract.try_uniqueTokenCreators(
    tokenId,
    BigInt.fromI32(index)
  );
  {
    while (tokenCreator.reverted != true) {
      token.uniqueTokenCreators = token.uniqueTokenCreators.concat([
        tokenCreator.value,
      ]);
      index = index + 1;
      tokenCreator = asyncContract.try_uniqueTokenCreators(
        tokenId,
        BigInt.fromI32(index)
      );
    }
  }
  token.save();
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
  let masterToken = createToken(
    tokenStart,
    true,
    platformFirstSalePercentage,
    platformSecondSalePercentage,
    owner
  );

  let tokenMasterObject = new TokenMaster(tokenStart.toString() + "-Master");
  tokenMasterObject.layerCount = layers;
  tokenMasterObject.tokenDetails = masterToken.id;
  tokenMasterObject.save();

  masterToken.tokenMaster = tokenMasterObject.id;
  masterToken.save();

  for (let index = 0; index < layers.toI32(); index++) {
    log.warning("How many times am I called", []);
    let tokenIdIndex = tokenStart.plus(BigInt.fromI32(index + 1));
    let token = createToken(
      tokenIdIndex,
      false,
      platformFirstSalePercentage,
      platformSecondSalePercentage,
      ZERO_ADDRESS
    );

    let tokenControllerObject = new TokenController(
      tokenIdIndex.toString() + "-Controller"
    );
    tokenControllerObject.numControlLevers = BigInt.fromI32(0);
    tokenControllerObject.numRemainingUpdates = BigInt.fromI32(0);
    tokenControllerObject.isSetup = false;
    tokenControllerObject.tokenDetails = token.id;
    tokenControllerObject.save();

    token.tokenController = tokenControllerObject.id;
    token.save();
  }
}
//////////////////////////////////////////////////
//////////// LOAD TOKEN HOOK /////////////////////
//////////////////////////////////////////////////

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
