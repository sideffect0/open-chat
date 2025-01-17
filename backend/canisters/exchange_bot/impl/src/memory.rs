use ic_cdk::api::stable::StableWriter;
use ic_stable_structures::{
    memory_manager::{MemoryId, MemoryManager, VirtualMemory},
    DefaultMemoryImpl,
};
use std::cell::RefCell;

const UPGRADES: MemoryId = MemoryId::new(0);

pub type Memory = VirtualMemory<DefaultMemoryImpl>;

thread_local! {
    static MEMORY_MANAGER: RefCell<MemoryManager<DefaultMemoryImpl>>
        = RefCell::new(MemoryManager::init_with_bucket_size(DefaultMemoryImpl::default(), 4));
}

pub fn get_upgrades_memory() -> Memory {
    get_memory(UPGRADES)
}

// This forces the buckets to be the specified size rather than preserving the previous bucket size
pub fn reset_memory_manager() {
    let mut writer = StableWriter::default();
    writer.write(&[0, 0, 0]).unwrap();
    MEMORY_MANAGER.replace(MemoryManager::init_with_bucket_size(DefaultMemoryImpl::default(), 4));
}

fn get_memory(id: MemoryId) -> Memory {
    MEMORY_MANAGER.with(|m| m.borrow().get(id))
}
