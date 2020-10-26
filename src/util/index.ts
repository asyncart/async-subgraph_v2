import { Address, BigInt, log, Bytes } from "@graphprotocol/graph-ts";
import {
  StateChange,
  EventParam,
  EventParams,
  Owner,
  Artwork,
} from "../../generated/schema";

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
