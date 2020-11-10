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
import { GlobalState, ArtworkMaster, Artist } from "../generated/schema";
import { saveEventToStateChange } from "./util";

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

  let globalState = GlobalState.load("MASTER");
  if (globalState == null) {
    globalState = new GlobalState("MASTER");
    globalState.latestMasterTokenId = BigInt.fromI32(0);
    globalState.currentExpectedTokenSupply = BigInt.fromI32(0);
    globalState.minBidIncreasePercent = asyncContract.minBidIncreasePercent();
    globalState.artistSecondSalePercentage = asyncContract.artistSecondSalePercentage();
    globalState.platformAddress = asyncContract.platformAddress();
  }

  globalState.artistSecondSalePercentage = newSecondPercentage;
  globalState.save();
}

export function handleBidProposed(event: BidProposed): void {}

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

  let globalState = GlobalState.load("MASTER");
  if (globalState == null) {
    globalState = new GlobalState("MASTER");
    globalState.latestMasterTokenId = BigInt.fromI32(0);
    globalState.currentExpectedTokenSupply = BigInt.fromI32(0);
    globalState.minBidIncreasePercent = asyncContract.minBidIncreasePercent();
    globalState.artistSecondSalePercentage = asyncContract.artistSecondSalePercentage();
    globalState.platformAddress = asyncContract.platformAddress();
  }

  globalState.latestMasterTokenId = tokenId;
  globalState.currentExpectedTokenSupply = tokenId
    .plus(layerCount)
    .plus(BigInt.fromI32(1));

  let artist = Artist.load(artistAddressString);
  if (artist == null) {
    artist = new Artist(artistAddressString);
  }

  let artwork = new ArtworkMaster(
    tokenId.toString() + "-" + artistAddressString
  );

  artwork.creator = artist.id;
  artwork.masterId = tokenId;
  artwork.layerCount = layerCount;
  artwork.platformFirstSalePercentage = platformFirstSalePercentage;
  artwork.platformSecondSalePercentage = platformSecondSalePercentage;

  artist.save();
  artwork.save();
  globalState.save();
}

export function handlePermissionUpdated(event: PermissionUpdated): void {}

export function handlePlatformAddressUpdated(
  event: PlatformAddressUpdated
): void {
  let newPlatformAddress = event.params.platformAddress;
  let asyncContract = Contract.bind(event.address);

  let globalState = GlobalState.load("MASTER");
  if (globalState == null) {
    globalState = new GlobalState("MASTER");
    globalState.latestMasterTokenId = BigInt.fromI32(0);
    globalState.currentExpectedTokenSupply = BigInt.fromI32(0);
    globalState.minBidIncreasePercent = asyncContract.minBidIncreasePercent();
    globalState.artistSecondSalePercentage = asyncContract.artistSecondSalePercentage();
    globalState.platformAddress = asyncContract.platformAddress();
  }

  globalState.platformAddress = newPlatformAddress;
  globalState.save();
}

export function handlePlatformSalePercentageUpdated(
  event: PlatformSalePercentageUpdated
): void {}

export function handleTokenSale(event: TokenSale): void {}

export function handleTransfer(event: Transfer): void {}
