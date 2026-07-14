#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, Symbol};

#[contracttype]
pub enum DataKey {
    Admin,
    TrustScore(Address),
    Rules,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TrustRules {
    pub on_time_repayment_bonus: i128,
    pub vault_maturity_bonus: i128,
    pub loan_completed_bonus: i128,
    pub late_payment_penalty: i128,
    pub default_penalty: i128,
    pub early_vault_unlock_penalty: i128,
}

#[contract]
pub struct TrustContract;

#[contractimpl]
impl TrustContract {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("contract already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);

        // Default rules
        let default_rules = TrustRules {
            on_time_repayment_bonus: 5,
            vault_maturity_bonus: 3,
            loan_completed_bonus: 10,
            late_payment_penalty: -8,
            default_penalty: -20,
            early_vault_unlock_penalty: -5,
        };
        env.storage().instance().set(&DataKey::Rules, &default_rules);
    }

    pub fn set_rules(env: Env, rules: TrustRules) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::Rules, &rules);
    }

    pub fn get_rules(env: Env) -> TrustRules {
        env.storage().instance().get::<_, TrustRules>(&DataKey::Rules).unwrap()
    }

    pub fn get_trust_score(env: Env, user: Address) -> i128 {
        env.storage().persistent().get(&DataKey::TrustScore(user)).unwrap_or(30)
    }

    pub fn set_trust_score_direct(env: Env, user: Address, score: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().persistent().set(&DataKey::TrustScore(user.clone()), &score);

        env.events().publish(
            (Symbol::new(&env, "trust_direct"), user),
            score
        );
    }

    pub fn record_event(env: Env, user: Address, event_type: u32) {
        let rules: TrustRules = env.storage().instance().get(&DataKey::Rules).unwrap();
        let delta = match event_type {
            1 => rules.on_time_repayment_bonus,
            2 => rules.vault_maturity_bonus,
            3 => rules.loan_completed_bonus,
            4 => rules.late_payment_penalty,
            5 => rules.default_penalty,
            6 => rules.early_vault_unlock_penalty,
            _ => 0,
        };

        let mut score = env.storage().persistent().get(&DataKey::TrustScore(user.clone())).unwrap_or(30);
        score += delta;
        if score < 0 {
            score = 0;
        }
        env.storage().persistent().set(&DataKey::TrustScore(user.clone()), &score);

        env.events().publish(
            (Symbol::new(&env, "trust_event"), user, event_type),
            (delta, score)
        );
    }
}

#[cfg(test)]
mod test;

