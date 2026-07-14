#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, vec, token, Address, Env, Symbol, Val, IntoVal};

use trust_contract::TrustContractClient;


#[contracttype]
pub enum DataKey {
    Admin,
    VaultRules,
    VaultBalance(Address),
    LockRecord(Address, u64),
    LockCount(Address),
    TrustContract,
    ReserveWallet,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultRules {
    pub penalty_bps: i128,            // e.g. 1000 for 10%
    pub min_lock_days: u32,           // e.g. 30 days
    pub max_auto_lock_pct: i128,      // e.g. 50%
    pub max_manual_lock: i128,        // e.g. 1000 XLM (in stroops: 10_000_000_000)
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultLock {
    pub id: u64,
    pub amount: i128,
    pub maturity_timestamp: u64,
    pub status: u32, // 1 = Locked, 2 = Redeemed, 3 = EarlyUnlocked
}

#[contract]
pub struct VaultContract;

#[contractimpl]
impl VaultContract {
    pub fn init(env: Env, admin: Address, trust_contract: Address, reserve_wallet: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("contract already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TrustContract, &trust_contract);
        env.storage().instance().set(&DataKey::ReserveWallet, &reserve_wallet);

        // Default rules
        let default_rules = VaultRules {
            penalty_bps: 1000, // 10%
            min_lock_days: 30,
            max_auto_lock_pct: 50,
            max_manual_lock: 10_000_000_000, // 1000 XLM
        };
        env.storage().instance().set(&DataKey::VaultRules, &default_rules);
    }

    pub fn set_vault_rules(env: Env, rules: VaultRules) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::VaultRules, &rules);
    }

    pub fn get_vault_rules(env: Env) -> VaultRules {
        env.storage().instance().get::<_, VaultRules>(&DataKey::VaultRules).unwrap()
    }

    pub fn set_reserve_wallet(env: Env, wallet: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&DataKey::ReserveWallet, &wallet);
    }

    pub fn get_reserve_wallet(env: Env) -> Address {
        env.storage().instance().get(&DataKey::ReserveWallet).unwrap()
    }

    pub fn lock_vault(env: Env, owner: Address, token: Address, amount: i128, lock_days: u32) -> u64 {
        owner.require_auth();
        if amount <= 0 {
            panic!("amount must be positive");
        }

        let rules = Self::get_vault_rules(env.clone());
        if lock_days < rules.min_lock_days {
            panic!("lock duration is below minimum lock period");
        }

        if amount > rules.max_manual_lock {
            panic!("amount exceeds maximum manual lock limit");
        }

        let client = token::Client::new(&env, &token);
        client.transfer(&owner, &env.current_contract_address(), &amount);

        let mut balance = env.storage().persistent().get(&DataKey::VaultBalance(owner.clone())).unwrap_or(0);
        balance += amount;
        env.storage().persistent().set(&DataKey::VaultBalance(owner.clone()), &balance);

        let mut count = env.storage().persistent().get(&DataKey::LockCount(owner.clone())).unwrap_or(0u64);
        count += 1;
        env.storage().persistent().set(&DataKey::LockCount(owner.clone()), &count);

        let maturity = env.ledger().timestamp() + (lock_days as u64 * 24 * 60 * 60);
        let lock_record = VaultLock {
            id: count,
            amount,
            maturity_timestamp: maturity,
            status: 1,
        };
        env.storage().persistent().set(&DataKey::LockRecord(owner.clone(), count), &lock_record);

        env.events().publish(
            (Symbol::new(&env, "lock_vault"), owner, count),
            (amount, maturity)
        );

        count
    }

    pub fn redeem_vault(env: Env, owner: Address, token: Address, lock_id: u64) {
        owner.require_auth();
        let key = DataKey::LockRecord(owner.clone(), lock_id);
        let mut lock: VaultLock = env.storage().persistent().get(&key)
            .unwrap_or_else(|| panic!("lock record not found"));

        if lock.status != 1 {
            panic!("lock record is not active");
        }

        let rules = Self::get_vault_rules(env.clone());
        let now = env.ledger().timestamp();
        let client = token::Client::new(&env, &token);
        
        let mut balance = env.storage().persistent().get(&DataKey::VaultBalance(owner.clone())).unwrap_or(0);
        
        if now >= lock.maturity_timestamp {
            // Matured redemption (no penalty)
            lock.status = 2; // Redeemed
            balance -= lock.amount;
            
            client.transfer(&env.current_contract_address(), &owner, &lock.amount);
            
            // Trigger maturity bonus on Trust Contract
            let trust_contract_address: Address = env.storage().instance().get(&DataKey::TrustContract).unwrap();
            let trust_client = TrustContractClient::new(&env, &trust_contract_address);
            trust_client.record_event(&owner, &2);
            
            env.events().publish(
                (Symbol::new(&env, "redeem_matured"), owner.clone(), lock_id),
                lock.amount
            );
        } else {
            // Emergency premature unlock (penalty fee routed to reserve)
            lock.status = 3; // EarlyUnlocked
            balance -= lock.amount;

            let penalty = (lock.amount * rules.penalty_bps) / 10000;
            let net_refund = lock.amount - penalty;
            
            if net_refund > 0 {
                client.transfer(&env.current_contract_address(), &owner, &net_refund);
            }
            if penalty > 0 {
                let reserve_wallet = Self::get_reserve_wallet(env.clone());
                client.transfer(&env.current_contract_address(), &reserve_wallet, &penalty);
            }

            // Trigger penalty on Trust Contract
            let trust_contract_address: Address = env.storage().instance().get(&DataKey::TrustContract).unwrap();
            let trust_client = TrustContractClient::new(&env, &trust_contract_address);
            trust_client.record_event(&owner, &6);

            env.events().publish(
                (Symbol::new(&env, "redeem_emergency"), owner.clone(), lock_id),
                (net_refund, penalty)
            );
        }

        env.storage().persistent().set(&key, &lock);
        env.storage().persistent().set(&DataKey::VaultBalance(owner), &balance);
    }

    pub fn get_vault_balance(env: Env, owner: Address) -> i128 {
        env.storage().persistent().get(&DataKey::VaultBalance(owner)).unwrap_or(0)
    }

    pub fn get_lock(env: Env, owner: Address, lock_id: u64) -> Option<VaultLock> {
        env.storage().persistent().get(&DataKey::LockRecord(owner, lock_id))
    }
}

#[cfg(test)]
mod test;

