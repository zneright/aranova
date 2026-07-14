#![cfg(test)]
use super::{TrustContract, TrustContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_trust_scoring_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let user = Address::generate(&env);

    let contract_id = env.register_contract(None, TrustContract);
    let client = TrustContractClient::new(&env, &contract_id);
    client.init(&admin);

    assert_eq!(client.get_trust_score(&user), 30);

    client.record_event(&user, &1);
    assert_eq!(client.get_trust_score(&user), 35);

    client.record_event(&user, &5);
    assert_eq!(client.get_trust_score(&user), 15);

    client.set_trust_score_direct(&user, &80);
    assert_eq!(client.get_trust_score(&user), 80);
}
