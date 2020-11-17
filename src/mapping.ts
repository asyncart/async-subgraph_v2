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
import {
  GlobalState,
  Bid,
  Token,
  Sale,
  TokenControlLever,
} from "../generated/schema";
import {
  saveEventToStateChange,
  getOrInitialiseGlobalState,
  createTokensFromMasterTokenId,
  populateTokenUniqueCreators,
  getPermissionedAddress,
  getOrInitialiseLever,
} from "./util";

export function handleArtistSecondSalePercentUpdated(
  event: ArtistSecondSalePercentUpdated
): void {
  let newSecondPercentage = event.params.artistSecondPercentage;
  let asyncContract = Contract.bind(event.address);
  let globalState = getOrInitialiseGlobalState(asyncContract);

  // Testing purposes
  // populateTokenUniqueCreators(asyncContract, BigInt.fromI32(1));

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

  let token = Token.load(tokenId.toString());
  if (token == null) {
    log.warning("Bid on token that doesn't exist", []);
  } else {
    let bid = new Bid(tokenId.toString() + "-" + txHash.toHex());
    bid.tokenDetails = tokenId.toString();
    bid.bidAmount = bidAmount;
    bid.bidder = bidder;
    bid.bidTimestamp = txTimestamp;
    bid.bidActive = true;
    bid.bidAccepted = false;

    let oldBid = Bid.load(token.currentBid);
    if (oldBid != null) {
      oldBid.bidActive = false;
      oldBid.save();
    }

    token.currentBid = bid.id;

    token.save();
    bid.save();
  }
}

export function handleBidWithdrawn(event: BidWithdrawn): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;

  let token = Token.load(tokenId.toString());
  if (token == null) {
    log.critical("Token should be defined", []);
  } else {
    let bid = Bid.load(token.currentBid);
    if (bid == null) {
      log.warning("Bid should be defined", []);
    } else {
      bid.bidActive = false;
      bid.save();
    }
  }
}

export function handleBuyPriceSet(event: BuyPriceSet): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let buyPrice = event.params.price;

  let token = Token.load(tokenId.toString());
  if (token == null) {
    log.critical("Token should be defined", []);
  }
  token.currentBuyPrice = buyPrice;
  token.save();
}

export function handleControlLeverUpdated(event: ControlLeverUpdated): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let priorityTip = event.params.priorityTip;
  let numRemainingUpdates = event.params.numRemainingUpdates;
  let leverIds = event.params.leverIds;
  let previousValues = event.params.previousValues;
  let updatedValues = event.params.updatedValues;

  let asyncContract = Contract.bind(event.address);

  let token = Token.load(tokenId.toString());
  if (token == null) {
    log.critical("Token should be defined", []);
  }

  // TODO: Implemenation. Waiting on this:
  // https://github.com/graphprotocol/graph-node/issues/2011
  for (let i = 0; i < previousValues.length; i++) {
    let lever = getOrInitialiseLever(asyncContract, tokenId, leverIds[i]);
    // TODO: Get min and max when possible....

    lever.previousValue = previousValues[i];
    lever.currentValue = updatedValues[i];
    lever.save();
  }
  // Lots to do here!

  // Withdraw bids if finite control token
  // Decrease number of updates if not infite

  token.save();
}

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

  createTokensFromMasterTokenId(
    asyncContract,
    tokenId,
    layerCount,
    artistAddressString
  );

  //populateTokenUniqueCreators(asyncContract, tokenId);
  globalState.save();
}

export function handlePermissionUpdated(event: PermissionUpdated): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let addressOfGranter = event.params.tokenOwner;
  let permissioned = event.params.permissioned;

  // Check the owner is the current owner!
  //let asyncContract = Contract.bind(event.address);

  let token = Token.load(tokenId.toString());
  if (token == null) {
    log.critical("Token should be defined", []);
  }

  // Only update this if called by current token owner!
  if (addressOfGranter.toHex() == token.owner) {
    token.permissionedAddress = permissioned;
    token.save();
  }
}

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
): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let platformFirstPercentage = event.params.platformFirstPercentage;
  let platformSecondPercentage = event.params.platformSecondPercentage;

  let token = Token.load(tokenId.toString());
  if (token == null) {
    log.critical("Token should be defined", []);
  }
  token.platformFirstSalePercentage = platformFirstPercentage;
  token.platformSecondSalePercentage = platformSecondPercentage;
  token.save();
}

export function handleTokenSale(event: TokenSale): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let salePrice = event.params.salePrice;
  let buyer = event.params.buyer;

  let asyncContract = Contract.bind(event.address);

  let token = Token.load(tokenId.toString());
  if (token == null) {
    log.critical("Token should be defined", []);
  }

  let sale = new Sale(tokenId.toString() + "-" + txHash.toHex());
  sale.tokenDetails = token.id;
  sale.buyer = buyer;
  sale.salePrice = salePrice;
  sale.saleTimestamp = txTimestamp;
  sale.tokenSaleNumber = token.numberOfSales.plus(BigInt.fromI32(1));
  sale.isBidSale = false;

  let bid = Bid.load(token.currentBid);
  if (bid == null) {
    log.info("No bid exists", []);
  } else {
    if (
      bid.bidAmount.equals(salePrice) &&
      buyer.toHexString() == bid.bidder.toHexString()
    ) {
      bid.bidAccepted = true;
      sale.isBidSale = true;
      sale.bidDetails = bid.id;
    }
    bid.bidActive = false;
    bid.save();
  }

  token.lastSalePrice = salePrice;
  token.currentBuyPrice = BigInt.fromI32(0);
  token.numberOfSales = token.numberOfSales.plus(BigInt.fromI32(1));
  token.tokenDidHaveFirstSale = true;
  token.currentBid = null;
  // If the token get bought back and was previously permissioned, this permission remains!
  let possiblePermissionedAddress = getPermissionedAddress(
    asyncContract,
    tokenId,
    buyer
  );
  token.permissionedAddress = possiblePermissionedAddress;
  // reset permissioned address.
  sale.save();
  token.save();
}

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

export function handleTransfer(event: Transfer): void {}
