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

// Constants
export const CONTRACT_ID = import.meta.env.VITE_CONTRACT_ID || "CAGIHBOLPSZX5MKWGGEEGJ323WWDVVG2CHXWQOV4VKGTZL2U6FY7NANH";
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
async function simulateReadOnlyCall(methodName: string, args: any[] = []): Promise<any> {
  try {
    const contract = new Contract(CONTRACT_ID);
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
    ]);
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
    ]);
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
  }
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

    const contract = new Contract(CONTRACT_ID);
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
    signingHandler
  );
}

/**
 * Release credit to a driver.
 */
export async function releaseCredit(
  coopAddress: string,
  driverAddress: string,
  approvedAmount: bigint,
  interestRateBps: bigint,
  durationDays: number,
  signingHandler: any,
  tokenAddress: string = DEFAULT_TOKEN_ADDRESS
): Promise<string> {
  return submitWriteTransaction(
    coopAddress,
    "release_credit",
    [
      Address.fromString(coopAddress).toScVal(),
      Address.fromString(driverAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
      nativeToScVal(approvedAmount, { type: "i128" }),
      nativeToScVal(interestRateBps, { type: "i128" }),
      nativeToScVal(durationDays, { type: "u32" }),
    ],
    signingHandler
  );
}

/**
 * Repay credit by the driver.
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
    signingHandler
  );
}

/**
 * Submit P2P payment through smart contract with vault routing percentage
 */
export async function payP2P(
  senderAddress: string,
  recipientAddress: string,
  amount: bigint,
  vaultPctBps: bigint,
  signingHandler: any,
  tokenAddress: string = DEFAULT_TOKEN_ADDRESS
): Promise<string> {
  return submitWriteTransaction(
    senderAddress,
    "pay",
    [
      Address.fromString(senderAddress).toScVal(),
      Address.fromString(recipientAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
      nativeToScVal(amount, { type: "i128" }),
      nativeToScVal(vaultPctBps, { type: "i128" }),
    ],
    signingHandler
  );
}

/**
 * Lock funds directly into personal vault on-chain
 */
export async function lockVaultOnChain(
  ownerAddress: string,
  amount: bigint,
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
    ],
    signingHandler
  );
}

/**
 * Redeem locked funds from personal vault on-chain
 */
export async function redeemVaultOnChain(
  ownerAddress: string,
  amount: bigint,
  signingHandler: any,
  tokenAddress: string = DEFAULT_TOKEN_ADDRESS
): Promise<string> {
  return submitWriteTransaction(
    ownerAddress,
    "redeem_vault",
    [
      Address.fromString(ownerAddress).toScVal(),
      Address.fromString(tokenAddress).toScVal(),
      nativeToScVal(amount, { type: "i128" }),
    ],
    signingHandler
  );
}

/**
 * Query on-chain vault balance of a user
 */
export async function getVaultBalanceOnChain(ownerAddress: string): Promise<bigint> {
  try {
    const result = await simulateReadOnlyCall("get_vault", [
      Address.fromString(ownerAddress).toScVal(),
    ]);
    return result ? BigInt(result) : 0n;
  } catch (err) {
    console.warn("Blockchain vault balance query failed. Relying on synced database records.");
    return -1n;
  }
}

