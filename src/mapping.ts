import { BigInt, log } from "@graphprotocol/graph-ts";
import {
  Contract,
  Approval,
  ApprovalForAll,
  ArtistSecondSalePercentUpdated,
  BidProposed,
  BidWithdrawn,
  BuyPriceSet,
  ControlLeverUpdated,
  CreatorWhitelisted,
  PermissionUpdated,
  PlatformAddressUpdated,
  PlatformSalePercentageUpdated,
  TokenSale,
  Transfer,
} from "../generated/Contract/Contract";
import { GlobalState, Artist, Bid } from "../generated/schema";
import {
  saveEventToStateChange,
  getOrInitialiseGlobalState,
  createTokensFromMasterTokenId,
} from "./util";

export function handleApproval(event: Approval): void {
  let owner = event.params.owner;
  let ownerString = owner.toHex();
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;

  let eventParamValues: Array<string> = [ownerString];
  let eventParamNames: Array<string> = ["owner"];
  let eventParamTypes: Array<string> = ["address"];

  saveEventToStateChange(
    event.transaction.hash,
    txTimestamp,
    blockNumber,
    "Approval",
    eventParamValues,
    eventParamNames,
    eventParamTypes,
    [],
    [],
    0
  );
}

export function handleApprovalForAll(event: ApprovalForAll): void {}

export function handleArtistSecondSalePercentUpdated(
  event: ArtistSecondSalePercentUpdated
): void {
  let newSecondPercentage = event.params.artistSecondPercentage;
  let asyncContract = Contract.bind(event.address);
  let globalState = getOrInitialiseGlobalState(asyncContract);

  globalState.artistSecondSalePercentage = newSecondPercentage;
  globalState.save();
}

export function handleBidProposed(event: BidProposed): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let bidAmount = event.params.bidAmount;
  let bidder = event.params.bidder;

  let bid = new Bid(tokenId.toString() + "-" + txHash.toString());
  bid.tokenId = tokenId;
  bid.bidAmount = bidAmount;
  bid.bidder = bidder;
  bid.bidTimestamp = txTimestamp;
  bid.bidActive = true;
  bid.bidAccepted = false;

  bid.save();
}

export function handleBidWithdrawn(event: BidWithdrawn): void {}

export function handleBuyPriceSet(event: BuyPriceSet): void {}

export function handleControlLeverUpdated(event: ControlLeverUpdated): void {}

export function handleCreatorWhitelisted(event: CreatorWhitelisted): void {
  log.warning("Whitelist", []);
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let layerCount = event.params.layerCount;
  let creator = event.params.creator;
  let artistAddressString = creator.toHex();

  let asyncContract = Contract.bind(event.address);
  let platformFirstSalePercentage = asyncContract.platformFirstSalePercentages(
    tokenId
  );
  let platformSecondSalePercentage = asyncContract.platformSecondSalePercentages(
    tokenId
  );

  let globalState = getOrInitialiseGlobalState(asyncContract);

  globalState.latestMasterTokenId = tokenId;
  globalState.currentExpectedTokenSupply = tokenId
    .plus(layerCount)
    .plus(BigInt.fromI32(1));

  createTokensFromMasterTokenId(asyncContract, tokenId, layerCount);

  globalState.save();
}

export function handlePermissionUpdated(event: PermissionUpdated): void {}

export function handlePlatformAddressUpdated(
  event: PlatformAddressUpdated
): void {
  let newPlatformAddress = event.params.platformAddress;
  let asyncContract = Contract.bind(event.address);
  let globalState = getOrInitialiseGlobalState(asyncContract);

  globalState.platformAddress = newPlatformAddress;
  globalState.save();
}

export function handlePlatformSalePercentageUpdated(
  event: PlatformSalePercentageUpdated
): void {}

export function handleTokenSale(event: TokenSale): void {}

export function handleTransfer(event: Transfer): void {}
