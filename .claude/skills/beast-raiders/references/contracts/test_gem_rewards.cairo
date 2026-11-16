// Fixture: .claude/skills/beast-raiders/fixtures/claim-signature.json (made with starknet.js)
use gem_rewards::{IGemRewardsDispatcher, IGemRewardsDispatcherTrait};
use openzeppelin_interfaces::token::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, declare, start_cheat_block_timestamp_global,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;

const PUBKEY: felt252 = 0x4838c4ed86f1c9b4fe1aac884ac79431b0243b79d9e24500eb0f6229f4fe72a;
const SIG_R: felt252 = 0x2d6a3935a80cc8469287c8b209867fca1a7d9816c6f3146ab9851e9be79085;
const SIG_S: felt252 = 0x6e8ff1b8bb21721f8b6dcfb5a0ad5a2f98a9d8c67a869a6bf8cca36f7a89a6c;
const NONCE: felt252 = 0x7777;
const AMOUNT: u256 = 250_000_000_000_000_000_000;

fn player() -> ContractAddress { 0x2222.try_into().unwrap() }
fn owner() -> ContractAddress { 0x9999.try_into().unwrap() }

fn deploy() -> ContractAddress {
    let class = declare("GemRewards").unwrap().contract_class();
    let mut calldata = array![];
    calldata.append(owner().into());
    calldata.append(PUBKEY);
    let addr: ContractAddress = 0x1111.try_into().unwrap();
    let (deployed, _) = class.deploy_at(@calldata, addr).unwrap();
    deployed
}

#[test]
fn claim_with_server_signature_mints() {
    let addr = deploy();
    start_cheat_caller_address(addr, player());
    IGemRewardsDispatcher { contract_address: addr }.claim(AMOUNT, NONCE, SIG_R, SIG_S);
    stop_cheat_caller_address(addr);
    assert(IERC20Dispatcher { contract_address: addr }.balance_of(player()) == AMOUNT, 'balance');
    assert(IGemRewardsDispatcher { contract_address: addr }.is_nonce_used(NONCE), 'nonce');
}

#[test]
#[should_panic(expected: 'nonce used')]
fn claim_replay_fails() {
    let addr = deploy();
    let g = IGemRewardsDispatcher { contract_address: addr };
    start_cheat_caller_address(addr, player());
    g.claim(AMOUNT, NONCE, SIG_R, SIG_S);
    g.claim(AMOUNT, NONCE, SIG_R, SIG_S);
}

#[test]
#[should_panic(expected: 'bad signature')]
fn claim_by_other_caller_fails() {
    let addr = deploy();
    start_cheat_caller_address(addr, 0x3333.try_into().unwrap());
    IGemRewardsDispatcher { contract_address: addr }.claim(AMOUNT, NONCE, SIG_R, SIG_S);
}

#[test]
#[should_panic(expected: 'bad signature')]
fn claim_inflated_amount_fails() {
    let addr = deploy();
    start_cheat_caller_address(addr, player());
    IGemRewardsDispatcher { contract_address: addr }.claim(AMOUNT * 10, NONCE, SIG_R, SIG_S);
}

#[test]
fn faucet_cooldown() {
    let addr = deploy();
    let g = IGemRewardsDispatcher { contract_address: addr };
    start_cheat_block_timestamp_global(1000);
    start_cheat_caller_address(addr, player());
    g.faucet();
    assert(g.next_faucet_at(player()) == 1000 + 86400, 'next');
    start_cheat_block_timestamp_global(1000 + 86400);
    g.faucet();
    assert(
        IERC20Dispatcher { contract_address: addr }.balance_of(player()) == 200_000_000_000_000_000_000,
        'two drips',
    );
}

#[test]
#[should_panic(expected: 'faucet cooldown')]
fn faucet_twice_same_day_fails() {
    let addr = deploy();
    start_cheat_block_timestamp_global(1000);
    start_cheat_caller_address(addr, player());
    let g = IGemRewardsDispatcher { contract_address: addr };
    g.faucet();
    g.faucet();
}
