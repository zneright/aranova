#![no_std]
use core::option::Option;
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

const ADMIN_FEE: i128 = 2_000_000;
const COOP_FEE: i128 = 3_000_000;

#[contracttype]
pub enum DataKey {
    Admin,
    Pool(Address),
    Loan(Address),
    Vault(Address),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LoanRecord {
    pub principal: i128,
    pub coop: Address,
    pub approved_amount: i128,
    pub interest_rate_bps: i128,
    pub duration_days: u32,
}

#[contract]
pub struct AranovaContract;

#[contractimpl]
impl AranovaContract {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("contract already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn deposit_pool(env: Env, coop: Address, token: Address, amount: i128) {
        coop.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let client = token::Client::new(&env, &token);
        client.transfer(&coop, &env.current_contract_address(), &amount);

        let mut pool = env.storage().persistent().get(&DataKey::Pool(coop.clone())).unwrap_or(0);
        pool += amount;
        env.storage().persistent().set(&DataKey::Pool(coop), &pool);
    }

    pub fn release_credit(
        env: Env,
        coop: Address,
        driver: Address,
        token: Address,
        approved_amount: i128,
        interest_rate_bps: i128,
        duration_days: u32,
    ) {
        coop.require_auth();
        if approved_amount <= 0 {
            panic!("approved amount must be positive");
        }

        let mut pool = env.storage().persistent().get(&DataKey::Pool(coop.clone())).unwrap_or(0);
        if pool < approved_amount {
            panic!("insufficient cooperative pool balance");
        }

        if env.storage().persistent().has(&DataKey::Loan(driver.clone())) {
            panic!("driver already has an active credit");
        }

        pool -= approved_amount;
        env.storage().persistent().set(&DataKey::Pool(coop.clone()), &pool);
        env.storage().persistent().set(
            &DataKey::Loan(driver.clone()),
            &LoanRecord {
                principal: approved_amount,
                coop: coop.clone(),
                approved_amount,
                interest_rate_bps,
                duration_days,
            },
        );

        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &driver, &approved_amount);
    }

    pub fn repay_credit(env: Env, driver: Address, token: Address) {
        driver.require_auth();

        let loan: LoanRecord = env.storage().persistent().get(&DataKey::Loan(driver.clone())).unwrap();
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        let total_due = loan.principal + ADMIN_FEE + COOP_FEE;

        let client = token::Client::new(&env, &token);
        client.transfer(&driver, &env.current_contract_address(), &total_due);
        client.transfer(&env.current_contract_address(), &admin, &ADMIN_FEE);
        client.transfer(&env.current_contract_address(), &loan.coop, &COOP_FEE);

        let mut pool = env.storage().persistent().get(&DataKey::Pool(loan.coop.clone())).unwrap_or(0);
        pool += loan.principal;
        env.storage().persistent().set(&DataKey::Pool(loan.coop), &pool);
        env.storage().persistent().remove(&DataKey::Loan(driver));
    }

    pub fn pay(
        env: Env,
        sender: Address,
        recipient: Address,
        token: Address,
        amount: i128,
        vault_pct_bps: i128,
    ) {
        sender.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }
        if vault_pct_bps < 0 || vault_pct_bps > 10000 {
            panic!("vault percentage basis points must be between 0 and 10000");
        }

        let vault_amount = (amount * vault_pct_bps) / 10000;
        let recipient_amount = amount - vault_amount;

        let client = token::Client::new(&env, &token);

        if recipient_amount > 0 {
            client.transfer(&sender, &recipient, &recipient_amount);
        }

        if vault_amount > 0 {
            client.transfer(&sender, &env.current_contract_address(), &vault_amount);
            let key = DataKey::Vault(recipient.clone());
            let mut current_vault = env.storage().persistent().get(&key).unwrap_or(0);
            current_vault += vault_amount;
            env.storage().persistent().set(&key, &current_vault);
        }
    }

    pub fn lock_vault(env: Env, owner: Address, token: Address, amount: i128) {
        owner.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }
        let client = token::Client::new(&env, &token);
        client.transfer(&owner, &env.current_contract_address(), &amount);

        let key = DataKey::Vault(owner.clone());
        let mut current_vault = env.storage().persistent().get(&key).unwrap_or(0);
        current_vault += amount;
        env.storage().persistent().set(&key, &current_vault);
    }

    pub fn redeem_vault(env: Env, owner: Address, token: Address, amount: i128) {
        owner.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }
        let key = DataKey::Vault(owner.clone());
        let mut current_vault = env.storage().persistent().get(&key).unwrap_or(0);
        if current_vault < amount {
            panic!("insufficient vault balance");
        }
        current_vault -= amount;
        env.storage().persistent().set(&key, &current_vault);

        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &owner, &amount);
    }

    pub fn get_pool(env: Env, coop: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Pool(coop)).unwrap_or(0)
    }

    pub fn get_loan(env: Env, driver: Address) -> Option<LoanRecord> {
        env.storage().persistent().get(&DataKey::Loan(driver))
    }

    pub fn get_vault(env: Env, owner: Address) -> i128 {
        let key = DataKey::Vault(owner);
        env.storage().persistent().get(&key).unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
