#![cfg(test)]

use super::{AranovaContract, AranovaContractClient, LoanRecord};
use soroban_sdk::{testutils::Address as _, token, Address, Env};

const ADMIN_FEE: i128 = 2_000_000;
const COOP_FEE: i128 = 3_000_000;

struct Fixture {
    env: Env,
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
        env,
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
    assert_eq!(fix.token.balance(&fix.coop), 23_000_000);
    assert_eq!(fix.contract.get_pool(&fix.coop), 50_000_000);
    assert!(fix.contract.get_loan(&fix.driver).is_none());
}

#[test]
#[should_panic(expected = "insufficient cooperative pool balance")]
fn release_fails_when_pool_is_too_small() {
    let fix = setup();
    fix.asset.mint(&fix.coop, &10_000_000);
    fix.contract.deposit_pool(&fix.coop, &fix.token.address, &10_000_000);

    fix.contract.release_credit(
        &fix.coop,
        &fix.driver,
        &fix.token.address,
        &11_000_000,
        &250,
        &30,
    );
}

#[test]
#[should_panic(expected = "driver already has an active credit")]
fn release_fails_for_second_active_loan() {
    let fix = setup();
    fix.asset.mint(&fix.coop, &100_000_000);
    fix.contract.deposit_pool(&fix.coop, &fix.token.address, &50_000_000);

    fix.contract.release_credit(
        &fix.coop,
        &fix.driver,
        &fix.token.address,
        &10_000_000,
        &250,
        &30,
    );

    fix.contract.release_credit(
        &fix.coop,
        &fix.driver,
        &fix.token.address,
        &5_000_000,
        &250,
        &30,
    );
}