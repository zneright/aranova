#![cfg(test)]
extern crate std;
use super::{FuelCreditContract, FuelCreditContractClient, CoopConfig};
use soroban_sdk::{contract, contractimpl, testutils::Address as _, token, Address, Env, Symbol};

#[contract]
pub struct MockTrustContract;

#[contractimpl]
impl MockTrustContract {
    pub fn record_event(env: Env, user: Address, event_type: u32) {
        std::println!("MockTrustContract: record_event called for event {}", event_type);
        env.events().publish((Symbol::new(&env, "mock_record_event"), user), event_type);
    }
    pub fn get_trust_score(env: Env, user: Address) -> i128 {
        std::println!("MockTrustContract: get_trust_score query");
        55
    }
}

#[test]
fn test_fuel_credit_borrow_repay_flow() {
    let builder = std::thread::Builder::new().stack_size(16 * 1024 * 1024);
    let handler = builder.spawn(|| {
        let env = Env::default();
        env.mock_all_auths();

        std::println!("STATION 1: env setup complete");

        let admin = Address::generate(&env);
        let coop = Address::generate(&env);
        let driver = Address::generate(&env);

        let token_admin = Address::generate(&env);
        let token_id = env.register_stellar_asset_contract(token_admin);
        let token = token::Client::new(&env, &token_id);
        let asset = token::StellarAssetClient::new(&env, &token_id);

        let trust_id = env.register_contract(None, MockTrustContract);
        let fuel_id = env.register_contract(None, FuelCreditContract);
        let fuel = FuelCreditContractClient::new(&env, &fuel_id);

        std::println!("STATION 2: contracts registered");

        fuel.init(&admin, &trust_id);
        std::println!("STATION 3: init called");

        fuel.set_coop_config(&coop, &CoopConfig {
            max_fuel_credit: 100_000_000,
            min_trust_score: 50,
            interest_rate_bps: 250,
            lending_enabled: true,
            max_concurrent_loans: 1,
            reserve_ratio_bps: 2000,
        });
        std::println!("STATION 4: set_coop_config called");

        // Initialize trustlines by minting to all participating accounts
        asset.mint(&admin, &10_000_000);
        asset.mint(&coop, &100_000_000);
        asset.mint(&driver, &10_000_000);
        std::println!("STATION 5: token minted");

        fuel.deposit_pool(&coop, &token_id, &50_000_000);
        std::println!("STATION 6: deposit_pool called");

        fuel.request_fuel_credit(&driver, &coop, &token_id, &30_000_000);
        std::println!("STATION 7: request_fuel_credit called");

        assert_eq!(token.balance(&driver), 40_000_000);
        assert_eq!(fuel.get_pool(&coop), 20_000_000);
        std::println!("STATION 8: first asserts passed");

        fuel.repay_credit(&driver, &token_id);
        std::println!("STATION 9: repay_credit called");

        assert_eq!(fuel.get_pool(&coop), 50_000_000);
        std::println!("STATION 10: all tests completed successfully!");
    }).unwrap();
    handler.join().unwrap();
}
