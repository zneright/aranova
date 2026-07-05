#![cfg(test)]

use super::{AranovaContract, AranovaContractClient, LoanRecord};
use soroban_sdk::{testutils::Address as _, token, Address, Env};

const ADMIN_FEE: i128 = 2_000_000;

struct Fixture {
    contract: AranovaContractClient<'static>,
    token: token::Client<'static>,
    asset: token::StellarAssetClient<'static>,
    admin: Address,
    coop: Address,
    driver: Address,
}

fn setup() -> Fixture {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let coop = Address::generate(&env);
    let driver = Address::generate(&env);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    let token = token::Client::new(&env, &token_id);
    let asset = token::StellarAssetClient::new(&env, &token_id);

    let contract_id = env.register_contract(None, AranovaContract);
    let contract = AranovaContractClient::new(&env, &contract_id);
    contract.init(&admin);

    Fixture {
        contract,
        token,
        asset,
        admin,
        coop,
        driver,
    }
}

#[test]
fn deposit_updates_the_pool_balance() {
    let fix = setup();
    fix.asset.mint(&fix.coop, &100_000_000);

    fix.contract.deposit_pool(&fix.coop, &fix.token.address, &40_000_000);

    assert_eq!(fix.token.balance(&fix.coop), 60_000_000);
    assert_eq!(fix.token.balance(&fix.contract.address), 40_000_000);
    assert_eq!(fix.contract.get_pool(&fix.coop), 40_000_000);
}

#[test]
fn release_credit_moves_funds_from_the_coop_pool_to_driver() {
    let fix = setup();
    fix.asset.mint(&fix.coop, &100_000_000);
    fix.contract.deposit_pool(&fix.coop, &fix.token.address, &50_000_000);

    fix.contract.release_credit(
        &fix.coop,
        &fix.driver,
        &fix.token.address,
        &30_000_000,
        &250,
        &30,
    );

    assert_eq!(fix.token.balance(&fix.driver), 30_000_000);
    assert_eq!(fix.contract.get_pool(&fix.coop), 20_000_000);

    let loan: Option<LoanRecord> = fix.contract.get_loan(&fix.driver);
    assert!(loan.is_some());
    let loan = loan.unwrap();
    assert_eq!(loan.principal, 30_000_000);
    assert_eq!(loan.coop, fix.coop);
    assert_eq!(loan.approved_amount, 30_000_000);
    assert_eq!(loan.interest_rate_bps, 250);
    assert_eq!(loan.duration_days, 30);
}

#[test]
fn repayment_returns_principal_to_pool_and_routes_fees() {
    let fix = setup();
    fix.asset.mint(&fix.coop, &100_000_000);
    fix.asset.mint(&fix.driver, &100_000_000);

    fix.contract.deposit_pool(&fix.coop, &fix.token.address, &50_000_000);
    fix.contract.release_credit(
        &fix.coop,
        &fix.driver,
        &fix.token.address,
        &30_000_000,
        &250,
        &30,
    );

    fix.contract.repay_credit(&fix.driver, &fix.token.address);

    assert_eq!(fix.token.balance(&fix.admin), ADMIN_FEE);
    assert_eq!(fix.token.balance(&fix.coop), 53_000_000);
    assert_eq!(fix.contract.get_pool(&fix.coop), 50_000_000);
    assert!(fix.contract.get_loan(&fix.driver).is_none());
}

#[test]
fn pay_splits_and_routes_vault_percentage() {
    let fix = setup();
    let sender = Address::generate(&fix.token.env);
    let recipient = Address::generate(&fix.token.env);
    fix.asset.mint(&sender, &100_000_000);

    // Pay 10 XLM (10,000,000 stroops) with 10% (1000 bps) routed to recipient's vault
    fix.contract.pay(&sender, &recipient, &fix.token.address, &10_000_000, &1000);

    // Sender balance: 90 XLM
    assert_eq!(fix.token.balance(&sender), 90_000_000);
    // Recipient balance: 9 XLM
    assert_eq!(fix.token.balance(&recipient), 9_000_000);
    // Recipient vault on-chain: 1 XLM
    assert_eq!(fix.contract.get_vault(&recipient), 1_000_000);
    // Contract balance: 1 XLM
    assert_eq!(fix.token.balance(&fix.contract.address), 1_000_000);
}

#[test]
fn lock_vault_deposits_into_vault_directly() {
    let fix = setup();
    fix.asset.mint(&fix.driver, &100_000_000);

    fix.contract.lock_vault(&fix.driver, &fix.token.address, &20_000_000);

    assert_eq!(fix.token.balance(&fix.driver), 80_000_000);
    assert_eq!(fix.contract.get_vault(&fix.driver), 20_000_000);
    assert_eq!(fix.token.balance(&fix.contract.address), 20_000_000);
}

#[test]
fn redeem_vault_releases_locked_funds() {
    let fix = setup();
    fix.asset.mint(&fix.driver, &100_000_000);

    fix.contract.lock_vault(&fix.driver, &fix.token.address, &50_000_000);
    assert_eq!(fix.contract.get_vault(&fix.driver), 50_000_000);

    fix.contract.redeem_vault(&fix.driver, &fix.token.address, &20_000_000);

    assert_eq!(fix.contract.get_vault(&fix.driver), 30_000_000);
    assert_eq!(fix.token.balance(&fix.driver), 70_000_000);
    assert_eq!(fix.token.balance(&fix.contract.address), 30_000_000);
}
