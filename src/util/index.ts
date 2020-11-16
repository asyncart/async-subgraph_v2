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
} from "../../generated/schema";
import { Contract } from "../../generated/Contract/Contract";

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
//////////// TOKEN /////////////////////
////////////////////////////////////////
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
  token.lastSalePrice = BigInt.fromI32(0);
  token.numberOfSales = BigInt.fromI32(0);
  token.tokenDidHaveFirstSale = false;
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
  let masterToken = createToken(
    tokenStart,
    true,
    platformFirstSalePercentage,
    platformSecondSalePercentage
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
      platformSecondSalePercentage
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
