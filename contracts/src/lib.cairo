use starknet::ContractAddress;

#[starknet::interface]
pub trait IGemRewards<TState> {
    /// Mint `amount` GEM to the caller if the game server signed (contract, caller, amount, nonce).
    fn claim(ref self: TState, amount: u256, nonce: felt252, sig_r: felt252, sig_s: felt252);
    /// 100 GEM once per 24h per address, so new players can start.
    fn faucet(ref self: TState);
    fn is_nonce_used(self: @TState, nonce: felt252) -> bool;
    fn next_faucet_at(self: @TState, who: ContractAddress) -> u64;
    fn signer(self: @TState) -> felt252;
    fn set_signer(ref self: TState, public_key: felt252);
}

#[starknet::contract]
pub mod GemRewards {
    use core::ecdsa::check_ecdsa_signature;
    use core::poseidon::poseidon_hash_span;
    use openzeppelin_access::ownable::OwnableComponent;
    use openzeppelin_token::erc20::{DefaultConfig, ERC20Component, ERC20HooksEmptyImpl};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};

    pub const FAUCET_AMOUNT: u256 = 100_000_000_000_000_000_000; // 100 GEM (18 decimals)
    pub const FAUCET_COOLDOWN: u64 = 86400;

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);
    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;
    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        signer_pubkey: felt252,
        used_nonces: Map<felt252, bool>,
        last_faucet: Map<ContractAddress, u64>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        Claimed: Claimed,
    }

    #[derive(Drop, starknet::Event)]
    struct Claimed {
        #[key]
        player: ContractAddress,
        amount: u256,
        nonce: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState, owner: ContractAddress, signer_pubkey: felt252) {
        self.erc20.initializer("Beast Gem", "GEM");
        self.ownable.initializer(owner);
        self.signer_pubkey.write(signer_pubkey);
    }

    #[abi(embed_v0)]
    impl GemRewardsImpl of super::IGemRewards<ContractState> {
        fn claim(ref self: ContractState, amount: u256, nonce: felt252, sig_r: felt252, sig_s: felt252) {
            assert(!self.used_nonces.read(nonce), 'nonce used');
            let player = get_caller_address();
            let msg = poseidon_hash_span(
                array![
                    get_contract_address().into(), player.into(), amount.low.into(),
                    amount.high.into(), nonce,
                ]
                    .span(),
            );
            assert(check_ecdsa_signature(msg, self.signer_pubkey.read(), sig_r, sig_s), 'bad signature');
            self.used_nonces.write(nonce, true);
            self.erc20.mint(player, amount);
            self.emit(Claimed { player, amount, nonce });
        }

        fn faucet(ref self: ContractState) {
            let who = get_caller_address();
            let now = get_block_timestamp();
            let last = self.last_faucet.read(who);
            assert(last == 0 || now >= last + FAUCET_COOLDOWN, 'faucet cooldown');
            self.last_faucet.write(who, now);
            self.erc20.mint(who, FAUCET_AMOUNT);
        }

        fn is_nonce_used(self: @ContractState, nonce: felt252) -> bool {
            self.used_nonces.read(nonce)
        }

        fn next_faucet_at(self: @ContractState, who: ContractAddress) -> u64 {
            let last = self.last_faucet.read(who);
            if last == 0 { 0 } else { last + FAUCET_COOLDOWN }
        }

        fn signer(self: @ContractState) -> felt252 {
            self.signer_pubkey.read()
        }

        fn set_signer(ref self: ContractState, public_key: felt252) {
            self.ownable.assert_only_owner();
            self.signer_pubkey.write(public_key);
        }
    }
}
