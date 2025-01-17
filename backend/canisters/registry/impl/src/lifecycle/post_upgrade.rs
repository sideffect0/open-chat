use crate::lifecycle::{init_env, init_state, UPGRADE_BUFFER_SIZE};
use crate::memory::{get_upgrades_memory, reset_memory_manager};
use crate::{mutate_state, Data};
use canister_logger::LogEntry;
use canister_tracing_macros::trace;
use ic_cdk_macros::post_upgrade;
use ic_stable_structures::reader::{BufferedReader, Reader};
use registry_canister::post_upgrade::Args;
use tracing::info;
use types::CanisterId;
use utils::cycles::init_cycles_dispenser_client;

#[post_upgrade]
#[trace]
fn post_upgrade(args: Args) {
    let env = init_env();

    let memory = get_upgrades_memory();
    let reader = BufferedReader::new(UPGRADE_BUFFER_SIZE, Reader::new(&memory, 0));

    let (data, logs, traces): (Data, Vec<LogEntry>, Vec<LogEntry>) = serializer::deserialize(reader).unwrap();

    canister_logger::init_with_logs(data.test_mode, logs, traces);

    init_cycles_dispenser_client(data.cycles_dispenser_canister_id);
    init_state(env, data, args.wasm_version);

    let ledger = CanisterId::from_text("ryjl3-tyaaa-aaaaa-aaaba-cai").unwrap();
    let root = CanisterId::from_text("r7inp-6aaaa-aaaaa-aaabq-cai").unwrap();
    let governance = CanisterId::from_text("rrkah-fqaaa-aaaaa-aaaaq-cai").unwrap();
    let index = CanisterId::from_text("qhbym-qaaaa-aaaaa-aaafq-cai").unwrap();

    mutate_state(|state| {
        state
            .data
            .add_icp_token_details(ledger, root, governance, index, state.env.now())
    });

    reset_memory_manager();

    info!(version = %args.wasm_version, "Post-upgrade complete");
}
