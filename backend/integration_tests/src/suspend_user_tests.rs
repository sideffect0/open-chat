use crate::rng::random_message_id;
use crate::setup::{return_env, setup_env};
use crate::{client, SERVICE_PRINCIPAL};
use std::time::Duration;
use types::{MessageContent, TextContent};

#[test]
fn suspend_user() {
    let (mut env, canister_ids) = setup_env();

    let user1 = client::user_index::happy_path::register_user(&mut env, canister_ids.user_index);
    let user2 = client::user_index::happy_path::register_user(&mut env, canister_ids.user_index);
    let group = client::user::happy_path::create_group(&mut env, &user1, "SUSPEND_USER_TEST", false, false);

    client::user_index::suspend_user(
        &mut env,
        SERVICE_PRINCIPAL,
        canister_ids.user_index,
        &user_index_canister::suspend_user::Args {
            user_id: user1.user_id,
            duration: None,
        },
    );

    env.tick();

    let user_response1 = client::user_index::happy_path::current_user(&env, user1.principal, canister_ids.user_index);
    assert!(user_response1.suspended);

    let direct_message_response1 = client::user::send_message(
        &mut env,
        user1.principal,
        user1.user_id.into(),
        &user_canister::send_message::Args {
            recipient: user2.user_id,
            thread_root_message_index: None,
            message_id: random_message_id(),
            sender_name: user1.username(),
            content: MessageContent::Text(TextContent { text: "123".to_string() }),
            replies_to: None,
            forwarding: false,
            correlation_id: 0,
        },
    );
    assert!(matches!(
        direct_message_response1,
        user_canister::send_message::Response::UserSuspended
    ));

    let group_message_response1 = client::group::send_message(
        &mut env,
        user1.principal,
        group.into(),
        &group_canister::send_message::Args {
            thread_root_message_index: None,
            message_id: random_message_id(),
            sender_name: user1.username(),
            content: MessageContent::Text(TextContent { text: "123".to_string() }),
            replies_to: None,
            mentioned: Vec::new(),
            forwarding: false,
            correlation_id: 0,
        },
    );
    assert!(matches!(
        group_message_response1,
        group_canister::send_message::Response::UserSuspended
    ));

    client::user_index::unsuspend_user(
        &mut env,
        SERVICE_PRINCIPAL,
        canister_ids.user_index,
        &user_index_canister::unsuspend_user::Args { user_id: user1.user_id },
    );

    env.tick();

    let user_response2 = client::user_index::happy_path::current_user(&env, user1.principal, canister_ids.user_index);
    assert!(!user_response2.suspended);

    let direct_message_response2 = client::user::send_message(
        &mut env,
        user1.principal,
        user1.user_id.into(),
        &user_canister::send_message::Args {
            recipient: user2.user_id,
            thread_root_message_index: None,
            message_id: random_message_id(),
            sender_name: user1.username(),
            content: MessageContent::Text(TextContent { text: "123".to_string() }),
            replies_to: None,
            forwarding: false,
            correlation_id: 0,
        },
    );
    assert!(matches!(
        direct_message_response2,
        user_canister::send_message::Response::Success(_)
    ));

    let group_message_response2 = client::group::send_message(
        &mut env,
        user1.principal,
        group.into(),
        &group_canister::send_message::Args {
            thread_root_message_index: None,
            message_id: random_message_id(),
            sender_name: user1.username(),
            content: MessageContent::Text(TextContent { text: "123".to_string() }),
            replies_to: None,
            mentioned: Vec::new(),
            forwarding: false,
            correlation_id: 0,
        },
    );
    assert!(matches!(
        group_message_response2,
        group_canister::send_message::Response::Success(_)
    ));

    return_env(env, canister_ids);
}

#[test]
fn suspend_user_for_duration() {
    let (mut env, canister_ids) = setup_env();

    let user = client::user_index::happy_path::register_user(&mut env, canister_ids.user_index);

    client::user_index::suspend_user(
        &mut env,
        SERVICE_PRINCIPAL,
        canister_ids.user_index,
        &user_index_canister::suspend_user::Args {
            user_id: user.user_id,
            duration: Some(1000),
        },
    );

    env.advance_time(Duration::from_millis(1000));
    env.tick();

    let user_response1 = client::user_index::happy_path::current_user(&env, user.principal, canister_ids.user_index);
    assert!(user_response1.suspended);

    env.advance_time(Duration::from_millis(1));
    env.tick();

    let user_response2 = client::user_index::happy_path::current_user(&env, user.principal, canister_ids.user_index);
    assert!(!user_response2.suspended);

    return_env(env, canister_ids);
}