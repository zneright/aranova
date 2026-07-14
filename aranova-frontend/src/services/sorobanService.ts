import {
  rpc,
  Address,
  Contract,
  TransactionBuilder,
  Networks,
  nativeToScVal,
  scValToNative,
  Keypair,
  Account,
  Horizon,
  Operation,
  Asset,
} from "@stellar/stellar-sdk";

// MVP Deployed Contract IDs & Registry
export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || "CCXX5IPHC2I6U36ZP2PALB6YPP2G36D2MBDGEYYXF3YQVS75BPMINCNE";
export const CONTRACT_REGISTRY = {
  trust: import.meta.env.VITE_TRUST_CONTRACT_ID || CONTRACT_ID,
  vault: import.meta.env.VITE_VAULT_CONTRACT_ID || CONTRACT_ID,
  fuelCredit: import.meta.env.VITE_FUEL_CREDIT_CONTRACT_ID || CONTRACT_ID,
  systemLoan: import.meta.env.VITE_SYSTEM_LOAN_CONTRACT_ID || CONTRACT_ID,
  version: 1
};
export const VAULT_CONTRACT_ID = CONTRACT_REGISTRY.vault;
export const LOAN_CONTRACT_ID = CONTRACT_REGISTRY.fuelCredit;

export const NETWORK = import.meta.env.VITE_NETWORK || "TESTNET";

export const RPC_URL = NETWORK === "PUBLIC"
  ? "https://soroban-rpc.stellar.org" // fallback or mainnet rpc
  : "https://soroban-testnet.stellar.org";

export const NETWORK_PASSPHRASE = NETWORK === "PUBLIC"
  ? Networks.PUBLIC
  : Networks.TESTNET;

// Default XLM token contract ID on Testnet
export const DEFAULT_TOKEN_ADDRESS = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

export const HORIZON_URL = NETWORK === "PUBLIC"
  ? "https://horizon.stellar.org"
  : "https://horizon-testnet.stellar.org";

const horizonServer = new Horizon.Server(HORIZON_URL);

/**
 * Fetch actual XLM balance from Stellar Horizon network
 */
export async function getLiveStellarBalance(publicKey: string): Promise<string> {
  try {
    const accountInfo = await horizonServer.loadAccount(publicKey);
    const nativeBalance = accountInfo.balances.find((b) => b.asset_type === "native");
    return nativeBalance ? nativeBalance.balance : "0.00";
  } catch (err) {
    if (NETWORK !== "PUBLIC") {
      console.log(`Account ${publicKey} not found on Testnet. Triggering Friendbot to fund...`);
      try {
        const res = await fetch(`https://friendbot.stellar.org/?addr=${publicKey}`);
        if (res.ok) {
          console.log(`Account ${publicKey} funded by Friendbot successfully.`);
          const accountInfo = await horizonServer.loadAccount(publicKey);
          const nativeBalance = accountInfo.balances.find((b) => b.asset_type === "native");
          return nativeBalance ? nativeBalance.balance : "10000.00";
        }
      } catch (friendbotErr) {
        console.warn("Friendbot auto-funding failed:", friendbotErr);
      }
    }
    console.warn("Stellar balance lookup failed. Account may not be funded/initialized on " + NETWORK);
    return "0.00";
  }
}

/**
 * Build, sign, and submit a live native XLM payment on the Stellar network
 */
export async function submitStellarPayment(
  sourceAddress: string,
  destinationAddress: string,
  amount: string,
  signerHandler: any
): Promise<string> {
  const accountInfo = await horizonServer.loadAccount(sourceAddress);
  const tx = new TransactionBuilder(accountInfo, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: destinationAddress,
        asset: Asset.native(),
        amount: amount,
      })
    )
    .setTimeout(0)
    .build();

  const xdr = tx.toXDR();
  let signedXdr = "";
  if (signerHandler.signWithSecret) {
    const keypair = Keypair.fromSecret(signerHandler.signWithSecret);
    tx.sign(keypair);
    signedXdr = tx.toXDR();
  } else if (signerHandler.signWithWallet) {
    const signedResult = await signerHandler.signWithWallet(xdr);
    signedXdr = typeof signedResult === "string" ? signedResult : signedResult.xdr;
  } else {
    throw new Error("No valid signing mechanism found in handler.");
  }

  const transaction = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const response = await horizonServer.submitTransaction(transaction);
  if (!response.successful) {
    throw new Error("Horizon transaction submission failed.");
  }
  return response.hash;
}

const DUMMY_SOURCE_KEYPAIR = Keypair.random();

const server = new rpc.Server(RPC_URL);

/**
 * Utility: Executes a read-only transaction simulation to retrieve contract values.
 */
async function simulateReadOnlyCall(methodName: string, args: any[] = [], contractId: string = CONTRACT_ID): Promise<any> {
  try {
    const contract = new Contract(contractId);
    const op = contract.call(methodName, ...args);

    // Create a dummy account to run the simulation
    const dummyAccount = new Account(DUMMY_SOURCE_KEYPAIR.publicKey(), "0");

    const tx = new TransactionBuilder(dummyAccount, {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(op)
      .setTimeout(0)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim)) {
      throw new Error(`Simulation failed for ${methodName}`);
    }

    if (sim.result?.retval) {
      return scValToNative(sim.result.retval);
    }
    return null;
  } catch (error) {
    throw error;
  }
}

/**
 * Fetch the balance of a cooperative's pool in the smart contract.
 */
export async function getPoolBalance(coopAddress: string): Promise<bigint> {
  try {
    const result = await simulateReadOnlyCall("get_pool", [
      Address.fromString(coopAddress).toScVal(),
    ], LOAN_CONTRACT_ID);
    return result ? BigInt(result) : 0n;
  } catch (err) {
    console.warn("Blockchain pool balance query failed. Relying on synced database records.");
    return -1n;
  }
}

export async function getLoanRecord(driverAddress: string): Promise<any | null> {
  try {
    const result = await simulateReadOnlyCall("get_loan", [
      Address.fromString(driverAddress).toScVal(),
    ], LOAN_CONTRACT_ID);
    return result || null;
  } catch (err) {
    console.warn("Blockchain loan record query failed. Relying on synced database records.");
    return null;
  }
}

/**
 * Signs and submits a transaction to the Soroban RPC.
 * Automatically handles account sequence fetching, simulation, assembly, signing, and polling.
 */
export async function submitWriteTransaction(
  sourceAddress: string,
  methodName: string,
  args: any[],
  signingHandler: {
    signWithSecret?: string; // Decrypted secret key for software wallet
    signWithWallet?: (xdr: string) => Promise<{ xdr: string } | string>; // Wallet kit signing function
  },
  contractId: string = CONTRACT_ID
): Promise<string> {
  try {
    // 1. Fetch source account from Soroban RPC
    let accountResponse;
    try {
      accountResponse = await server.getAccount(sourceAddress);
    } catch {
      // If account doesn't exist on-chain yet, bootstrap sequence "0"
      accountResponse = new Account(sourceAddress, "0");
    }

    const contract = new Contract(contractId);
    const op = contract.call(methodName, ...args);

    // 2. Build preliminary transaction
    const tx = new TransactionBuilder(accountResponse, {
      fee: "100",
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();

    // 3. Simulate transaction to calculate correct footprint, CPU/Mem instructions, and fee
    const simulated = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(simulated)) {
      throw new Error(`Simulation failed: ${JSON.stringify(simulated.error)}`);
    }

    // 4. Assemble the simulation results into the transaction
    const assembledTx = rpc.assembleTransaction(tx, simulated).build() as any;

    // 5. Sign the transaction
    let signedXdr = "";
    if (signingHandler.signWithSecret) {
      const keypair = Keypair.fromSecret(signingHandler.signWithSecret);
      assembledTx.sign(keypair);
      signedXdr = assembledTx.toXDR();
    } else if (signingHandler.signWithWallet) {
      const response = await signingHandler.signWithWallet(assembledTx.toXDR());
      if (typeof response === "string") {
        signedXdr = response;
      } else if (response && response.xdr) {
        signedXdr = response.xdr;
      } else {
        throw new Error("Invalid response received from wallet signer.");
      }
    } else {
      throw new Error("No valid signing mechanism provided.");
    }

    // 6. Submit signed transaction
    const sendResponse = await server.sendTransaction(
      TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)
    );

    if (sendResponse.status === "ERROR") {
      throw new Error(`Transaction failed to send: ${JSON.stringify(sendResponse.errorResult)}`);
    }

    // 7. Poll for final transaction result
    let status: any = sendResponse.status;
    let pollResponse: any;
    for (let i = 0; i < 15; i++) {
      pollResponse = await server.getTransaction(sendResponse.hash);
      status = pollResponse.status;

      if (status === "SUCCESS") {
        return sendResponse.hash;
      } else if (status === "FAILED") {
        throw new Error(`Transaction execution failed on-chain.`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error("Transaction verification timed out.");
  } catch (error) {
    console.error(`Error executing ${methodName}:`, error);
    throw error;
  }
}

/**
 * Deposit funds into the cooperative pool.
 */
export async function depositPool(
  coopAddress: string,
  amount: bigint,
  signingHandler: any,
  tokenAddress: string = DEFAULT_TOKEN_ADDRESS
): Promise<string> {
  return submitWriteTransaction(
    coopAddress,
    "deposit_pool",
    [
      Address.fromString(coopAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
      nativeToScVal(amount, { type: "i128" }),
    ],
    signingHandler,
    CONTRACT_REGISTRY.fuelCredit
  );
}

/**
 * Request fuel credit (auto approved check on-chain).
 */
export async function requestFuelCreditOnChain(
  driverAddress: string,
  coopAddress: string,
  amount: bigint,
  signingHandler: any,
  tokenAddress: string = DEFAULT_TOKEN_ADDRESS
): Promise<string> {
  return submitWriteTransaction(
    driverAddress,
    "request_fuel_credit",
    [
      Address.fromString(driverAddress).toScVal(),
      Address.fromString(coopAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
      nativeToScVal(amount, { type: "i128" }),
    ],
    signingHandler,
    CONTRACT_REGISTRY.fuelCredit
  );
}

/**
 * Repay fuel credit.
 */
export async function repayCredit(
  driverAddress: string,
  signingHandler: any,
  tokenAddress: string = DEFAULT_TOKEN_ADDRESS
): Promise<string> {
  return submitWriteTransaction(
    driverAddress,
    "repay_credit",
    [
      Address.fromString(driverAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
    ],
    signingHandler,
    CONTRACT_REGISTRY.fuelCredit
  );
}

/**
 * Repay fuel credit partially.
 */
export async function repayPartial(
  driverAddress: string,
  amount: bigint,
  signingHandler: any,
  tokenAddress: string = DEFAULT_TOKEN_ADDRESS
): Promise<string> {
  return submitWriteTransaction(
    driverAddress,
    "repay_partial",
    [
      Address.fromString(driverAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
      nativeToScVal(amount, { type: "i128" }),
    ],
    signingHandler,
    CONTRACT_REGISTRY.fuelCredit
  );
}

/**
 * Submit P2P payment using standard Stellar native payments operation.
 * For splits, uses an atomic multi-op transaction (Native payment + Soroban lock_vault).
 */
export async function payP2P(
  senderAddress: string,
  recipientAddress: string,
  amount: bigint,
  vaultPctBps: bigint,
  lockDays: number,
  signingHandler: any,
  tokenAddress: string = DEFAULT_TOKEN_ADDRESS
): Promise<string> {
  const accountInfo = await horizonServer.loadAccount(senderAddress);
  const vaultAmount = (amount * vaultPctBps) / 10000n;
  const liquidAmount = amount - vaultAmount;

  const txBuilder = new TransactionBuilder(accountInfo, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  });

  if (liquidAmount > 0n) {
    const liquidAmountStr = (Number(liquidAmount) / 10_000_000).toFixed(7);
    txBuilder.addOperation(
      Operation.payment({
        destination: recipientAddress,
        asset: Asset.native(),
        amount: liquidAmountStr,
      })
    );
  }

  if (vaultAmount > 0n) {
    const vaultContract = new Contract(CONTRACT_REGISTRY.vault);
    const lockOp = vaultContract.call(
      "lock_vault",
      Address.fromString(recipientAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
      nativeToScVal(vaultAmount, { type: "i128" }),
      nativeToScVal(lockDays, { type: "u32" })
    );
    txBuilder.addOperation(lockOp);
  }

  const tx = txBuilder.setTimeout(30).build();
  let finalTx = tx;

  if (vaultAmount > 0n) {
    const simulated = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(simulated)) {
      throw new Error(`Simulation failed: ${JSON.stringify(simulated.error)}`);
    }
    finalTx = rpc.assembleTransaction(tx, simulated).build() as any;
  }

  let signedXdr = "";
  if (signingHandler.signWithSecret) {
    const keypair = Keypair.fromSecret(signingHandler.signWithSecret);
    finalTx.sign(keypair);
    signedXdr = finalTx.toXDR();
  } else if (signingHandler.signWithWallet) {
    const response = await signingHandler.signWithWallet(finalTx.toXDR());
    signedXdr = typeof response === "string" ? response : response.xdr;
  } else {
    throw new Error("No signing mechanism found.");
  }

  const submittedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  const response = await horizonServer.submitTransaction(submittedTx);
  if (!response.successful) {
    throw new Error("P2P Payment submission failed.");
  }
  return response.hash;
}

/**
 * Lock funds directly into personal vault on-chain.
 */
export async function lockVaultOnChain(
  ownerAddress: string,
  amount: bigint,
  lockDays: number,
  signingHandler: any,
  tokenAddress: string = DEFAULT_TOKEN_ADDRESS
): Promise<string> {
  return submitWriteTransaction(
    ownerAddress,
    "lock_vault",
    [
      Address.fromString(ownerAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
      nativeToScVal(amount, { type: "i128" }),
      nativeToScVal(lockDays, { type: "u32" }),
    ],
    signingHandler,
    CONTRACT_REGISTRY.vault
  );
}

/**
 * Redeem locked funds from personal vault on-chain (matured or emergency premature).
 */
export async function redeemVaultOnChain(
  ownerAddress: string,
  lockId: bigint,
  signingHandler: any,
  tokenAddress: string = DEFAULT_TOKEN_ADDRESS
): Promise<string> {
  return submitWriteTransaction(
    ownerAddress,
    "redeem_vault",
    [
      Address.fromString(ownerAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
      nativeToScVal(lockId, { type: "u64" }),
    ],
    signingHandler,
    CONTRACT_REGISTRY.vault
  );
}

/**
 * Query on-chain vault balance of a user.
 */
export async function getVaultBalanceOnChain(ownerAddress: string): Promise<bigint> {
  try {
    const result = await simulateReadOnlyCall("get_vault_balance", [
      Address.fromString(ownerAddress).toScVal(),
    ], CONTRACT_REGISTRY.vault);
    return result ? BigInt(result) : 0n;
  } catch (err) {
    return -1n;
  }
}

/**
 * Query user trust score on-chain.
 */
export async function getTrustScoreOnChain(userAddress: string): Promise<bigint> {
  try {
    const result = await simulateReadOnlyCall("get_trust_score", [
      Address.fromString(userAddress).toScVal(),
    ], CONTRACT_REGISTRY.trust);
    return result ? BigInt(result) : 30n;
  } catch (err) {
    return 30n;
  }
}

/**
 * Set user trust score directly (admin only fallback).
 */
export async function setTrustScoreDirectOnChain(
  adminAddress: string,
  userAddress: string,
  score: bigint,
  signingHandler: any
): Promise<string> {
  return submitWriteTransaction(
    adminAddress,
    "set_trust_score_direct",
    [
      Address.fromString(userAddress).toScVal(),
      nativeToScVal(score, { type: "i128" }),
    ],
    signingHandler,
    CONTRACT_REGISTRY.trust
  );
}

/**
 * Set interest split configuration on-chain (admin only).
 */
export async function setInterestSplitOnChain(
  adminAddress: string,
  adminShareBps: bigint,
  signingHandler: any
): Promise<string> {
  return submitWriteTransaction(
    adminAddress,
    "set_interest_split",
    [
      nativeToScVal(adminShareBps, { type: "i128" }),
    ],
    signingHandler,
    CONTRACT_REGISTRY.fuelCredit
  );
}

/**
 * Set cooperative lending configuration on-chain.
 */
export async function setCoopConfigOnChain(
  coopAddress: string,
  maxFuelCredit: bigint,
  minTrustScore: bigint,
  interestRateBps: bigint,
  lendingEnabled: boolean,
  maxConcurrentLoans: number,
  reserveRatioBps: bigint,
  signingHandler: any
): Promise<string> {
  const configVal = nativeToScVal({
    max_fuel_credit: maxFuelCredit,
    min_trust_score: minTrustScore,
    interest_rate_bps: interestRateBps,
    lending_enabled: lendingEnabled,
    max_concurrent_loans: maxConcurrentLoans,
    reserve_ratio_bps: reserveRatioBps,
  });

  return submitWriteTransaction(
    coopAddress,
    "set_coop_config",
    [
      Address.fromString(coopAddress).toScVal(),
      configVal,
    ],
    signingHandler,
    CONTRACT_REGISTRY.fuelCredit
  );
}

/**
 * Disburse system loan on-chain (admin only).
 */
export async function disburseSystemLoanOnChain(
  adminAddress: string,
  borrowerAddress: string,
  tokenAddress: string,
  principal: bigint,
  interestRateBps: bigint,
  durationDays: number,
  signingHandler: any
): Promise<string> {
  return submitWriteTransaction(
    adminAddress,
    "disburse_loan",
    [
      Address.fromString(borrowerAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
      nativeToScVal(principal, { type: "i128" }),
      nativeToScVal(interestRateBps, { type: "i128" }),
      nativeToScVal(durationDays, { type: "u32" }),
    ],
    signingHandler,
    CONTRACT_REGISTRY.systemLoan
  );
}

/**
 * Repay system loan.
 */
export async function repaySystemLoanOnChain(
  borrowerAddress: string,
  tokenAddress: string,
  signingHandler: any
): Promise<string> {
  return submitWriteTransaction(
    borrowerAddress,
    "repay_loan",
    [
      Address.fromString(borrowerAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
    ],
    signingHandler,
    CONTRACT_REGISTRY.systemLoan
  );
}

/**
 * Repay system loan partially.
 */
export async function repaySystemLoanPartialOnChain(
  borrowerAddress: string,
  tokenAddress: string,
  amount: bigint,
  signingHandler: any
): Promise<string> {
  return submitWriteTransaction(
    borrowerAddress,
    "repay_loan_partial",
    [
      Address.fromString(borrowerAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
      nativeToScVal(amount, { type: "i128" }),
    ],
    signingHandler,
    CONTRACT_REGISTRY.systemLoan
  );
}

