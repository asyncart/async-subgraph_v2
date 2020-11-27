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
  User,
  LayerUpdate,
  TokenController,
  TokenTransfer,
} from "../generated/schema";
import {
  saveEventToStateChange,
  getOrInitialiseGlobalState,
  createTokensFromMasterTokenId,
  populateTokenUniqueCreators,
  getPermissionedAddress,
  getOrInitialiseToken,
  refreshGlobalState,
  createOrFetchUserString,
  // trySetMasterLayers,
} from "./util";

export function handleArtistSecondSalePercentUpdated(
  event: ArtistSecondSalePercentUpdated
): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let newSecondPercentage = event.params.artistSecondPercentage;
  let asyncContract = Contract.bind(event.address);
  let globalState = getOrInitialiseGlobalState(asyncContract);

  globalState.artistSecondSalePercentage = newSecondPercentage;
  globalState.save();

  let eventParamValues: Array<string> = [newSecondPercentage.toString()];
  let eventParamNames: Array<string> = ["artistSecondPercentage"];
  let eventParamTypes: Array<string> = ["uint256"];

  saveEventToStateChange(
    event.transaction.hash,
    txTimestamp,
    blockNumber,
    "ArtistSecondSalePercentUpdated",
    eventParamValues,
    eventParamNames,
    eventParamTypes,
    [],
    [],
    0
  );
}

export function handleBidProposed(event: BidProposed): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let bidAmount = event.params.bidAmount;
  let bidder = event.params.bidder;

  let asyncContract = Contract.bind(event.address);
  // Hooks to update state from contract
  let globalState = getOrInitialiseGlobalState(asyncContract);
  globalState.save();

  let token = getOrInitialiseToken(asyncContract, tokenId);
  let user = createOrFetchUserString(bidder.toHexString());
  if (token == null) {
    log.warning("Bid on token that doesn't exist", []);
  } else {
    let bid = new Bid(tokenId.toString() + "-" + txHash.toHex());
    bid.tokenDetails = tokenId.toString();
    bid.bidAmount = bidAmount;
    bid.bidder = user.id;
    bid.bidTimestamp = txTimestamp;
    bid.bidActive = true;
    bid.bidAccepted = false;

    let oldBid = Bid.load(token.currentBid);
    if (oldBid != null) {
      oldBid.bidActive = false;
      token.pastBids = token.pastBids.concat([oldBid.id]);
      oldBid.save();
    }

    user.bids = user.bids.concat([bid.id]);
    token.currentBid = bid.id;

    user.save();
    token.save();
    bid.save();
    // trySetMasterLayers();
    // linkMasterAndControllers();
  }

  let eventParamValues: Array<string> = [
    tokenId.toString(),
    bidAmount.toString(),
    bidder.toHex(),
  ];
  let eventParamNames: Array<string> = ["tokenId", "bidAmount", "bidder"];
  let eventParamTypes: Array<string> = ["uint256", "uint256", "address"];

  saveEventToStateChange(
    txHash,
    txTimestamp,
    blockNumber,
    "BidProposed",
    eventParamValues,
    eventParamNames,
    eventParamTypes,
    [user.id],
    [token.id],
    0
  );
}

export function handleBidWithdrawn(event: BidWithdrawn): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;

  let asyncContract = Contract.bind(event.address);
  refreshGlobalState(asyncContract);

  let token = getOrInitialiseToken(asyncContract, tokenId);
  if (token == null) {
    log.critical("Token should be defined", []);
  } else {
    let bid = Bid.load(token.currentBid);
    if (bid == null) {
      log.warning("Bid should be defined", []);
    } else {
      bid.bidActive = false;
      bid.BidWithdrawnTimestamp = txTimestamp;
      token.pastBids = token.pastBids.concat([bid.id]);
      bid.save();
      token.save();
    }
  }

  let eventParamValues: Array<string> = [tokenId.toString()];
  let eventParamNames: Array<string> = ["tokenId"];
  let eventParamTypes: Array<string> = ["uint256"];

  saveEventToStateChange(
    txHash,
    txTimestamp,
    blockNumber,
    "BidWithdrawn",
    eventParamValues,
    eventParamNames,
    eventParamTypes,
    [],
    [token.id],
    0
  );
}

export function handleBuyPriceSet(event: BuyPriceSet): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let buyPrice = event.params.price;

  let asyncContract = Contract.bind(event.address);
  // Hooks to update state from contract
  refreshGlobalState(asyncContract);

  let token = getOrInitialiseToken(asyncContract, tokenId);
  if (token == null) {
    log.warning("Token should be defined", []);
  }
  token.currentBuyPrice = buyPrice;
  token.save();
  // trySetMasterLayers();
  // linkMasterAndControllers();

  let eventParamValues: Array<string> = [
    tokenId.toString(),
    buyPrice.toString(),
  ];
  let eventParamNames: Array<string> = ["tokenId", "price"];
  let eventParamTypes: Array<string> = ["uint256", "uint256"];

  saveEventToStateChange(
    txHash,
    txTimestamp,
    blockNumber,
    "BuyPriceSet",
    eventParamValues,
    eventParamNames,
    eventParamTypes,
    [],
    [token.id],
    0
  );
}

export function handleControlLeverUpdated(event: ControlLeverUpdated): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let gasPrice = event.transaction.gasPrice;
  let gasUsed = event.transaction.gasUsed;
  let tokenId = event.params.tokenId;
  let priorityTip = event.params.priorityTip;
  let numRemainingUpdates = event.params.numRemainingUpdates;
  let leverIds = event.params.leverIds;
  let previousValues = event.params.previousValues;
  let updatedValues = event.params.updatedValues;
  let updateCost = gasUsed.times(gasPrice);

  let asyncContract = Contract.bind(event.address);
  refreshGlobalState(asyncContract);

  let token = getOrInitialiseToken(asyncContract, tokenId);
  if (token == null) {
    log.critical("Token should be defined", []);
  }

  let controllerToken = TokenController.load(
    tokenId.toString() + "-Controller"
  );
  let newNumberOfUpdates = controllerToken.numberOfUpdates.plus(
    BigInt.fromI32(1)
  );

  if (controllerToken.numberOfUpdates.equals(BigInt.fromI32(0))) {
    controllerToken.averageUpdateCost = updateCost;
  } else {
    // DOES BN LIBRAY follow bodmas! Surely?
    let numerator = controllerToken.averageUpdateCost
      .times(controllerToken.numberOfUpdates)
      .plus(updateCost);
    controllerToken.averageUpdateCost = numerator.div(newNumberOfUpdates);
  }

  controllerToken.numberOfUpdates = newNumberOfUpdates;
  controllerToken.numRemainingUpdates = numRemainingUpdates;

  let layerUpdate = new LayerUpdate(
    tokenId.toString() + "-" + newNumberOfUpdates.toString()
  );
  layerUpdate.updateNumber = newNumberOfUpdates;
  layerUpdate.gasPrice = gasPrice;
  layerUpdate.gasUsed = gasUsed;
  layerUpdate.costInWei = updateCost;
  layerUpdate.priorityTip = priorityTip;
  layerUpdate.layer = controllerToken.id;
  layerUpdate.leversUpdated = [];

  for (let i = 0; i < previousValues.length; i++) {
    let lever = TokenControlLever.load(
      tokenId.toString() + "-" + leverIds[i].toString()
    );
    lever.previousValue = previousValues[i];
    lever.currentValue = updatedValues[i];
    lever.latestUpdate = layerUpdate.id;
    lever.numberOfUpdates = lever.numberOfUpdates.plus(BigInt.fromI32(1));
    lever.save();
    layerUpdate.leversUpdated = layerUpdate.leversUpdated.concat([lever.id]);
  }

  controllerToken.allUpdates = controllerToken.allUpdates.concat([
    layerUpdate.id,
  ]);
  controllerToken.lastUpdate = layerUpdate.id;

  layerUpdate.save();
  controllerToken.save();
  token.save();

  let leverIdsString: Array<string> = [];
  let previousValuesString: Array<string> = [];
  let updatedValuesString: Array<string> = [];

  for (let i = 0; i < leverIds.length; i++) {
    leverIdsString = leverIdsString.concat([leverIds[i].toString()]);
    previousValuesString = previousValuesString.concat([
      previousValues[i].toString(),
    ]);
    updatedValuesString = updatedValuesString.concat([
      updatedValues[i].toString(),
    ]);
  }

  let eventParamValues: Array<string> = [
    tokenId.toString(),
    priorityTip.toString(),
    numRemainingUpdates.toString(),
    leverIdsString.toString(),
    previousValuesString.toString(),
    updatedValuesString.toString(),
  ];
  let eventParamNames: Array<string> = [
    "tokenId",
    "priorityTip",
    "numRemainingUpdates",
    "leverIds",
    "previousValues",
    "updatedValues",
  ];
  let eventParamTypes: Array<string> = [
    "uint256",
    "uint256",
    "int256",
    "uint256[]",
    "int256[]",
    "int256[]",
  ];

  saveEventToStateChange(
    txHash,
    txTimestamp,
    blockNumber,
    "ControlLeverUpdated",
    eventParamValues,
    eventParamNames,
    eventParamTypes,
    [token.owner],
    [token.id],
    0
  );
}

export function handleCreatorWhitelisted(event: CreatorWhitelisted): void {
  //log.warning("Whitelist", []);
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let layerCount = event.params.layerCount;
  let creator = event.params.creator;
  let artistAddressString = creator.toHex();

  let asyncContract = Contract.bind(event.address);
  let globalState = getOrInitialiseGlobalState(asyncContract);

  globalState.latestMasterTokenId = tokenId;
  globalState.currentExpectedTokenSupply = tokenId
    .plus(layerCount)
    .plus(BigInt.fromI32(1));

  globalState.save();

  createTokensFromMasterTokenId(asyncContract, tokenId, layerCount);

  let eventParamValues: Array<string> = [
    tokenId.toString(),
    layerCount.toString(),
    artistAddressString,
  ];
  let eventParamNames: Array<string> = ["tokenId", "layerCount", "creator"];
  let eventParamTypes: Array<string> = ["uint256", "uint256", "address"];

  saveEventToStateChange(
    txHash,
    txTimestamp,
    blockNumber,
    "CreatorWhitelisted",
    eventParamValues,
    eventParamNames,
    eventParamTypes,
    [],
    [],
    0
  );
}

export function handlePermissionUpdated(event: PermissionUpdated): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let addressOfGranter = event.params.tokenOwner;
  let permissioned = event.params.permissioned;

  let asyncContract = Contract.bind(event.address);
  // Hooks to update state from contract
  let globalState = getOrInitialiseGlobalState(asyncContract);
  globalState.save();

  let token = getOrInitialiseToken(asyncContract, tokenId);
  if (token == null) {
    log.critical("Token should be defined", []);
  }

  // Only update this if called by current token owner!
  if (addressOfGranter.toHex() == token.owner) {
    token.permissionedAddress = permissioned;
    token.save();
  }
  // trySetMasterLayers();
  //linkMasterAndControllers();

  let eventParamValues: Array<string> = [
    tokenId.toString(),
    addressOfGranter.toHex(),
    permissioned.toHex(),
  ];
  let eventParamNames: Array<string> = [
    "tokenId",
    "tokenOwner",
    "permissioned",
  ];
  let eventParamTypes: Array<string> = ["uint256", "address", "address"];

  saveEventToStateChange(
    txHash,
    txTimestamp,
    blockNumber,
    "PermissionUpdated",
    eventParamValues,
    eventParamNames,
    eventParamTypes,
    [],
    [token.id],
    0
  );
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

  let asyncContract = Contract.bind(event.address);
  // Hooks to update state from contract
  refreshGlobalState(asyncContract);

  let token = getOrInitialiseToken(asyncContract, tokenId);
  if (token == null) {
    log.critical("Token should be defined", []);
  }
  token.platformFirstSalePercentage = platformFirstPercentage;
  token.platformSecondSalePercentage = platformSecondPercentage;
  token.save();
  // trySetMasterLayers();
  // linkMasterAndControllers();

  let eventParamValues: Array<string> = [
    tokenId.toString(),
    platformFirstPercentage.toString(),
    platformSecondPercentage.toString(),
  ];
  let eventParamNames: Array<string> = [
    "tokenId",
    "platformFirstPercentage",
    "platformSecondPercentage",
  ];
  let eventParamTypes: Array<string> = ["uint256", "uint256", "uint256"];

  saveEventToStateChange(
    txHash,
    txTimestamp,
    blockNumber,
    "PlatformSalePercentageUpdated",
    eventParamValues,
    eventParamNames,
    eventParamTypes,
    [],
    [token.id],
    0
  );
}

export function handleTokenSale(event: TokenSale): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let salePrice = event.params.salePrice;
  let _buyer = event.params.buyer;

  let asyncContract = Contract.bind(event.address);
  // Hooks to update state from contract
  let globalState = getOrInitialiseGlobalState(asyncContract);
  globalState.totalSaleAmount = globalState.totalSaleAmount.plus(salePrice);

  let buyer = createOrFetchUserString(_buyer.toHexString());
  // Edge case, the token isn't intialised. Then token.owner would be set
  // to current owner which is already now the buyer.
  // No straight forward fix. Ignore for now.
  let token = getOrInitialiseToken(asyncContract, tokenId);
  let seller = User.load(token.owner);

  if (token == null) {
    log.critical("Token should be defined", []);
  }
  let tokenSaleNumber = token.numberOfSales.plus(BigInt.fromI32(1));

  let sale = new Sale(tokenId.toString() + "-" + tokenSaleNumber.toString());
  sale.tokenDetails = token.id;
  sale.buyer = buyer.id;
  sale.seller = seller.id;
  sale.salePrice = salePrice;
  sale.saleTimestamp = txTimestamp;
  sale.tokenSaleNumber = tokenSaleNumber;
  sale.isBidSale = false;

  let bid = Bid.load(token.currentBid);
  if (bid == null) {
    log.info("No bid exists", []);
  } else {
    if (bid.bidAmount.equals(salePrice) && _buyer.toHexString() == bid.bidder) {
      bid.bidAccepted = true;
      sale.isBidSale = true;
      sale.bidDetails = bid.id;
    }
    bid.bidActive = false;
    token.pastBids = token.pastBids.concat([bid.id]);
    bid.save();
  }

  token.owner = buyer.id;
  token.lastSale = sale.id;
  token.currentBuyPrice = BigInt.fromI32(0);
  token.numberOfSales = token.numberOfSales.plus(BigInt.fromI32(1));
  token.tokenDidHaveFirstSale = true;
  token.allSales = token.allSales.concat([sale.id]);
  token.currentBid = null;
  // If the token get bought back and was previously permissioned, this permission remains!
  let possiblePermissionedAddress = getPermissionedAddress(
    asyncContract,
    tokenId,
    _buyer
  );
  token.permissionedAddress = possiblePermissionedAddress;

  buyer.buys = buyer.buys.concat([sale.id]);
  seller.sells = seller.sells.concat([sale.id]);

  buyer.save();
  seller.save();
  sale.save();
  token.save();
  globalState.save();
  // trySetMasterLayers();
  // linkMasterAndControllers();

  let eventParamValues: Array<string> = [
    tokenId.toString(),
    salePrice.toString(),
    _buyer.toHexString(),
  ];
  let eventParamNames: Array<string> = ["tokenId", "salePrice", "_buyer"];
  let eventParamTypes: Array<string> = ["uint256", "uint256", "address"];

  saveEventToStateChange(
    txHash,
    txTimestamp,
    blockNumber,
    "TokenSale",
    eventParamValues,
    eventParamNames,
    eventParamTypes,
    [],
    [token.id],
    0
  );
}

export function handleTransfer(event: Transfer): void {
  let txTimestamp = event.block.timestamp;
  let blockNumber = event.block.number;
  let txHash = event.transaction.hash;
  let tokenId = event.params.tokenId;
  let _from = event.params.from;
  let _to = event.params.to;

  let asyncContract = Contract.bind(event.address);
  // Hooks to update state from contract
  refreshGlobalState(asyncContract);

  // Double check ordering here.
  let to = createOrFetchUserString(_to.toHexString());
  let token = getOrInitialiseToken(asyncContract, tokenId);
  let from = createOrFetchUserString(_from.toHexString());

  if (token == null) {
    log.critical("Token should be defined", []);
  }

  let transfer = new TokenTransfer(
    tokenId.toString() + "-" + txHash.toHexString()
  );
  transfer.tokenDetails = token.id;
  transfer.to = to.id;
  transfer.from = from.id;
  transfer.timestamp = txTimestamp;

  let possiblePermissionedAddress = getPermissionedAddress(
    asyncContract,
    tokenId,
    _to
  );
  token.permissionedAddress = possiblePermissionedAddress;
  token.owner = to.id;
  token.currentBuyPrice = BigInt.fromI32(0); // Since transfer overrides this to zero?
  token.lastTransfer = transfer.id;
  token.allTransfers = token.allTransfers.concat([transfer.id]);

  token.pastOwners =
    token.pastOwners.indexOf(from.id) === -1
      ? token.pastOwners.concat([from.id])
      : token.pastOwners;

  if (token.isMaster) {
    to.ownedMasters =
      to.ownedMasters.indexOf(token.id + "-Master") === -1
        ? to.ownedMasters.concat([token.id + "-Master"])
        : to.ownedMasters;
  } else {
    to.ownerControllers =
      to.ownerControllers.indexOf(token.id + "-Controller") === -1
        ? to.ownerControllers.concat([token.id + "-Controller"])
        : to.ownerControllers;
  }

  to.save();
  from.save();
  transfer.save();
  token.save();
  // trySetMasterLayers();
  // linkMasterAndControllers();

  let eventParamValues: Array<string> = [
    tokenId.toString(),
    _from.toHexString(),
    _to.toHexString(),
  ];
  let eventParamNames: Array<string> = ["tokenId", "from", "to"];
  let eventParamTypes: Array<string> = ["uint256", "address", "address"];

  saveEventToStateChange(
    txHash,
    txTimestamp,
    blockNumber,
    "Transfer",
    eventParamValues,
    eventParamNames,
    eventParamTypes,
    [],
    [token.id],
    0
  );
}

export function handleApproval(event: Approval): void {}

export function handleApprovalForAll(event: ApprovalForAll): void {}
