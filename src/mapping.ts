import { BigInt } from "@graphprotocol/graph-ts"
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
  Transfer
} from "../generated/Contract/Contract"
import { ExampleEntity } from "../generated/schema"

export function handleApproval(event: Approval): void {
  // Entities can be loaded from the store using a string ID; this ID
  // needs to be unique across all entities of the same type
  let entity = ExampleEntity.load(event.transaction.from.toHex())

  // Entities only exist after they have been saved to the store;
  // `null` checks allow to create entities on demand
  if (entity == null) {
    entity = new ExampleEntity(event.transaction.from.toHex())

    // Entity fields can be set using simple assignments
    entity.count = BigInt.fromI32(0)
  }

  // BigInt and BigDecimal math are supported
  entity.count = entity.count + BigInt.fromI32(1)

  // Entity fields can be set based on event parameters
  entity.owner = event.params.owner
  entity.approved = event.params.approved

  // Entities can be written to the store with `.save()`
  entity.save()

  // Note: If a handler doesn't require existing field values, it is faster
  // _not_ to load the entity from the store. Instead, create it fresh with
  // `new Entity(...)`, set the fields that should be updated and save the
  // entity back to the store. Fields that were not set or unset remain
  // unchanged, allowing for partial updates to be applied.

  // It is also possible to access smart contracts from mappings. For
  // example, the contract that has emitted the event can be connected to
  // with:
  //
  // let contract = Contract.bind(event.address)
  //
  // The following functions can then be called on this contract to access
  // state variables and other data:
  //
  // - contract.artistSecondSalePercentage(...)
  // - contract.balanceOf(...)
  // - contract.buyPrices(...)
  // - contract.controlTokenMapping(...)
  // - contract.creatorWhitelist(...)
  // - contract.expectedTokenSupply(...)
  // - contract.failedTransferCredits(...)
  // - contract.getApproved(...)
  // - contract.isApprovedForAll(...)
  // - contract.minBidIncreasePercent(...)
  // - contract.name(...)
  // - contract.ownerOf(...)
  // - contract.pendingBids(...)
  // - contract.permissionedControllers(...)
  // - contract.platformAddress(...)
  // - contract.platformFirstSalePercentages(...)
  // - contract.platformSecondSalePercentages(...)
  // - contract.supportsInterface(...)
  // - contract.symbol(...)
  // - contract.tokenByIndex(...)
  // - contract.tokenDidHaveFirstSale(...)
  // - contract.tokenOfOwnerByIndex(...)
  // - contract.tokenURI(...)
  // - contract.tokenURILocked(...)
  // - contract.totalSupply(...)
  // - contract.uniqueTokenCreators(...)
  // - contract.upgraderAddress(...)
  // - contract.getNumRemainingControlUpdates(...)
  // - contract.getControlToken(...)
}

export function handleApprovalForAll(event: ApprovalForAll): void {}

export function handleArtistSecondSalePercentUpdated(
  event: ArtistSecondSalePercentUpdated
): void {}

export function handleBidProposed(event: BidProposed): void {}

export function handleBidWithdrawn(event: BidWithdrawn): void {}

export function handleBuyPriceSet(event: BuyPriceSet): void {}

export function handleControlLeverUpdated(event: ControlLeverUpdated): void {}

export function handleCreatorWhitelisted(event: CreatorWhitelisted): void {}

export function handlePermissionUpdated(event: PermissionUpdated): void {}

export function handlePlatformAddressUpdated(
  event: PlatformAddressUpdated
): void {}

export function handlePlatformSalePercentageUpdated(
  event: PlatformSalePercentageUpdated
): void {}

export function handleTokenSale(event: TokenSale): void {}

export function handleTransfer(event: Transfer): void {}
