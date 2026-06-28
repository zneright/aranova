# Aranova Smart Contract

Decentralized transit finance network optimization architecture engineered on top of Stellar Soroban.

## Vision and Purpose
Aranova eliminates cash-flow constraints for transport networks in emerging regions. By integrating everyday micro-payments directly with automated credit systems, the platform provides unbanked commuters, drivers, and cooperatives with zero-risk liquidity lines, transforming standard transactional activity into transparent, functional credit history.

## Stellar Features Employed
* **Programmable Flows (Soroban):** Rulesets enforcing automated payment splits, programmatic vault locks, and riskless daily loan mechanics.
* **On-Chain Settlement Routing:** Real-time transfer routing utilizing classic and tokenized asset anchors.
* **Telegraphy Logs:** Native Soroban event publishers map user configuration changes and deposit splits immediately to indexing clients.

## Prerequisites
* **Rust Toolchain:** `rustc 1.75.0` or higher
* **Cargo Configuration:** Target extensions for WebAssembly processing profiles (`wasm32-unknown-unknown`)
* **Soroban CLI Version:** Engine builds >= `20.0.0`

## Build and Compilation
To build and optimize the source code into a target executable binary:
```bash
soroban contract build

## Deployed Contract

| Field | Value |
|-------|-------|
| Contract ID | `CAGIHBOLPSZX5MKWGGEEGJ323WWDVVG2CHXWQOV4VKGTZL2U6FY7NANH` |
| Network | testnet |
| Explorer | [View on stellar.expert](https://stellar.expert/explorer/testnet/contract/CAGIHBOLPSZX5MKWGGEEGJ323WWDVVG2CHXWQOV4VKGTZL2U6FY7NANH) |
| Deploy Tx | [View transaction](https://stellar.expert/explorer/testnet/tx/b66c66de7dc6027be384802b18bf5fa9ee97637c1456495e40b1fad5147290aa) |
| Deployed | 2026-06-28 17:44:54 UTC |
| Wallet | freighter (`GAGI…SF4G`) |

