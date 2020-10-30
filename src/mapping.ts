import { BigInt } from "@graphprotocol/graph-ts";
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
import { ExampleEntity } from "../generated/schema";
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
): void {}

export function handleBidProposed(event: BidProposed): void {}

export function handleBidWithdrawn(event: BidWithdrawn): void {}

export function handleBuyPriceSet(event: BuyPriceSet): void {}

export function handleControlLeverUpdated(event: ControlLeverUpdated): void {}

export function handleCreatorWhitelisted(event: CreatorWhitelisted): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let user = new ExampleEntity(txTimestamp.toString());
  user.blockNumber = blockNumber;
  user.save();
}

export function handlePermissionUpdated(event: PermissionUpdated): void {}

export function handlePlatformAddressUpdated(
  event: PlatformAddressUpdated
): void {}

export function handlePlatformSalePercentageUpdated(
  event: PlatformSalePercentageUpdated
): void {}

export function handleTokenSale(event: TokenSale): void {}

export function handleTransfer(event: Transfer): void {}
