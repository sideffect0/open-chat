import type { Identity } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import {
    ApiSendMessageArgs,
    ApiTransferCryptoWithinGroupArgs,
    idlFactory,
    UserService,
} from "./candid/idl";
import {
    EventsResponse,
    UpdateArgs,
    CandidateGroupChat,
    CreateGroupResponse,
    DeleteGroupResponse,
    DirectChatEvent,
    MergedUpdatesResponse,
    Message,
    SendMessageResponse,
    BlockUserResponse,
    UnblockUserResponse,
    LeaveGroupResponse,
    MarkReadResponse,
    IndexRange,
    AddRemoveReactionResponse,
    DeleteMessageResponse,
    JoinGroupResponse,
    EditMessageResponse,
    MarkReadRequest,
    GroupChatSummary,
    WithdrawCryptocurrencyResponse,
    CryptocurrencyContent,
    PendingCryptocurrencyWithdrawal,
    CurrentChatState,
    ArchiveChatResponse,
    BlobReference,
    CreatedUser,
    GroupInvite,
    MigrateUserPrincipalResponse,
    PinChatResponse,
    PublicProfile,
    SearchAllMessagesResponse,
    SearchDirectChatResponse,
    SetBioResponse,
    textToCode,
    ToggleMuteNotificationResponse,
    UnpinChatResponse,
    UserLookup,
    compareChats,
} from "openchat-shared";
import { CandidService } from "../candidService";
import {
    blockResponse,
    createGroupResponse,
    deleteGroupResponse,
    deleteMessageResponse,
    editMessageResponse,
    getEventsResponse,
    getUpdatesResponse,
    initialStateResponse,
    joinGroupResponse,
    leaveGroupResponse,
    markReadResponse,
    recommendedGroupsResponse,
    searchDirectChatResponse,
    searchAllMessagesResponse,
    sendMessageResponse,
    setAvatarResponse,
    setBioResponse,
    addRemoveReactionResponse,
    unblockResponse,
    withdrawCryptoResponse,
    transferWithinGroupResponse,
    publicProfileResponse,
    pinChatResponse,
    unpinChatResponse,
    migrateUserPrincipal,
    archiveChatResponse,
} from "./mappers";
import type { IUserClient } from "./user.client.interface";
import { mergeChatUpdates } from "../../utils/chat";
import { MAX_EVENTS } from "../../constants";
import type { Database } from "../../utils/caching";
import { CachingUserClient } from "./user.caching.client";
import {
    apiGroupPermissions,
    apiMessageContent,
    apiOptional,
    apiPendingCryptoContent,
    apiPendingCryptocurrencyWithdrawal,
    apiReplyContextArgs,
} from "../common/chatMappers";
import { DataClient } from "../data/data.client";
import { muteNotificationsResponse } from "../notifications/mappers";
import { identity, toVoid } from "../../utils/mapping";
import { getChatEventsInLoop } from "../common/chatEvents";
import { profile } from "../common/profiling";
import { apiGroupRules } from "../group/mappers";
import { generateUint64 } from "../../utils/rng";
import type { AgentConfig } from "../../config";

export class UserClient extends CandidService implements IUserClient {
    private userService: UserService;
    userId: string;

    constructor(identity: Identity, userId: string, private config: AgentConfig) {
        super(identity);
        this.userId = userId;
        this.userService = this.createServiceClient<UserService>(idlFactory, userId, config);
    }

    static create(
        userId: string,
        identity: Identity,
        config: AgentConfig,
        db: Database,
        groupInvite: GroupInvite | undefined
    ): IUserClient {
        return new CachingUserClient(
            db,
            identity,
            config,
            new UserClient(identity, userId, config),
            groupInvite
        );
    }

    @profile("userClient")
    createGroup(group: CandidateGroupChat): Promise<CreateGroupResponse> {
        return this.handleResponse(
            this.userService.create_group({
                is_public: group.isPublic,
                name: group.name,
                description: group.description,
                history_visible_to_new_joiners: group.historyVisible,
                avatar: apiOptional((data) => {
                    return {
                        id: DataClient.newBlobId(),
                        data,
                        mime_type: "image/jpg",
                    };
                }, group.avatar?.blobData),
                permissions: [apiGroupPermissions(group.permissions)],
                rules: apiGroupRules(group.rules),
            }),
            createGroupResponse
        );
    }

    @profile("userClient")
    deleteGroup(chatId: string): Promise<DeleteGroupResponse> {
        return this.handleResponse(
            this.userService.delete_group({
                chat_id: Principal.fromText(chatId),
            }),
            deleteGroupResponse
        );
    }

    @profile("userClient")
    chatEventsByIndex(
        eventIndexes: number[],
        userId: string,
        threadRootMessageIndex: number | undefined,
        latestClientEventIndex: number | undefined
    ): Promise<EventsResponse<DirectChatEvent>> {
        const args = {
            thread_root_message_index: apiOptional(identity, threadRootMessageIndex),
            user_id: Principal.fromText(userId),
            events: new Uint32Array(eventIndexes),
            latest_client_event_index: apiOptional(identity, latestClientEventIndex),
        };
        return this.handleQueryResponse(
            () => this.userService.events_by_index(args),
            (resp) => getEventsResponse(this.principal, resp, userId, latestClientEventIndex),
            args
        );
    }

    @profile("userClient")
    async chatEventsWindow(
        _eventIndexRange: IndexRange,
        userId: string,
        messageIndex: number,
        latestClientEventIndex: number | undefined
    ): Promise<EventsResponse<DirectChatEvent>> {
        const thread_root_message_index: [] = [];
        const args = {
            thread_root_message_index,
            user_id: Principal.fromText(userId),
            max_events: MAX_EVENTS,
            mid_point: messageIndex,
            latest_client_event_index: apiOptional(identity, latestClientEventIndex),
        };
        return this.handleQueryResponse(
            () => this.userService.events_window(args),
            (resp) => getEventsResponse(this.principal, resp, userId, latestClientEventIndex),
            args
        );
    }

    @profile("userClient")
    chatEvents(
        eventIndexRange: IndexRange,
        userId: string,
        startIndex: number,
        ascending: boolean,
        threadRootMessageIndex: number | undefined,
        latestClientEventIndex: number | undefined
    ): Promise<EventsResponse<DirectChatEvent>> {
        const getChatEventsFunc = (index: number, asc: boolean) => {
            const args = {
                thread_root_message_index: apiOptional(identity, threadRootMessageIndex),
                user_id: Principal.fromText(userId),
                max_events: MAX_EVENTS,
                start_index: index,
                ascending: asc,
                latest_client_event_index: apiOptional(identity, latestClientEventIndex),
            };

            return this.handleQueryResponse(
                () => this.userService.events(args),
                (resp) => getEventsResponse(this.principal, resp, userId, latestClientEventIndex),
                args
            );
        };

        return getChatEventsInLoop(getChatEventsFunc, eventIndexRange, startIndex, ascending);
    }

    @profile("userClient")
    async getInitialState(
        _userStore: UserLookup,
        _selectedChatId?: string
    ): Promise<MergedUpdatesResponse> {
        // FIXME - can't access localstorage in a worker
        // const disableCache =
        //     localStorage.getItem("openchat_disable_initial_state_cache") === "true";
        const disableCache = false;

        const resp = await this.handleQueryResponse(
            () => this.userService.initial_state({ disable_cache: [disableCache] }),
            initialStateResponse
        );

        return {
            wasUpdated: true,
            chatSummaries: resp.chats.sort(compareChats),
            timestamp: resp.timestamp,
            blockedUsers: resp.blockedUsers,
            pinnedChats: resp.pinnedChats,
            avatarIdUpdate: undefined,
            affectedEvents: {},
        };
    }

    @profile("userClient")
    async getUpdates(
        currentState: CurrentChatState,
        args: UpdateArgs,
        _userStore: UserLookup,
        _selectedChatId?: string
    ): Promise<MergedUpdatesResponse> {
        const updatesResponse = await this.handleQueryResponse(
            () =>
                this.userService.updates({
                    updates_since: {
                        timestamp: args.updatesSince.timestamp,
                        group_chats: args.updatesSince.groupChats.map((g) => ({
                            chat_id: Principal.fromText(g.chatId),
                            updates_since: g.lastUpdated,
                        })),
                    },
                }),
            getUpdatesResponse,
            args
        );

        const anyUpdates =
            updatesResponse.blockedUsers !== undefined ||
            updatesResponse.pinnedChats !== undefined ||
            updatesResponse.chatsUpdated.length > 0 ||
            updatesResponse.chatsAdded.length > 0 ||
            updatesResponse.chatsRemoved.size > 0 ||
            updatesResponse.avatarIdUpdate !== undefined ||
            updatesResponse.cyclesBalance !== undefined ||
            updatesResponse.transactions.length > 0;

        return {
            wasUpdated: anyUpdates,
            chatSummaries: anyUpdates
                ? mergeChatUpdates(currentState.chatSummaries, updatesResponse)
                : currentState.chatSummaries,
            timestamp: updatesResponse.timestamp,
            blockedUsers: updatesResponse.blockedUsers ?? currentState.blockedUsers,
            pinnedChats: updatesResponse.pinnedChats ?? currentState.pinnedChats,
            avatarIdUpdate: updatesResponse.avatarIdUpdate,
            affectedEvents: updatesResponse.chatsUpdated.reduce((result, chatSummary) => {
                if (chatSummary.affectedEvents.length > 0) {
                    result[chatSummary.chatId] = chatSummary.affectedEvents;
                }
                return result;
            }, {} as Record<string, number[]>),
        };
    }

    @profile("userClient")
    setAvatar(bytes: Uint8Array): Promise<BlobReference> {
        const blobId = DataClient.newBlobId();
        return this.handleResponse(
            this.userService.set_avatar({
                avatar: apiOptional(identity, {
                    id: blobId,
                    data: bytes,
                    mime_type: "image/jpg",
                }),
            }),
            setAvatarResponse
        ).then((resp) => {
            if (resp === "success") {
                return {
                    blobId,
                    canisterId: this.userId,
                };
            }
            throw new Error("Unable to set avatar");
        });
    }

    @profile("userClient")
    editMessage(
        recipientId: string,
        message: Message,
        threadRootMessageIndex?: number
    ): Promise<EditMessageResponse> {
        return DataClient.create(this.identity, this.config)
            .uploadData(message.content, [this.userId, recipientId])
            .then((content) => {
                const req = {
                    content: apiMessageContent(content ?? message.content),
                    user_id: Principal.fromText(recipientId),
                    thread_root_message_index: apiOptional(identity, threadRootMessageIndex),
                    message_id: message.messageId,
                    correlation_id: generateUint64(),
                };
                return this.handleResponse(this.userService.edit_message(req), editMessageResponse);
            });
    }

    @profile("userClient")
    sendMessage(
        recipientId: string,
        sender: CreatedUser,
        message: Message,
        replyingToChatId?: string,
        threadRootMessageIndex?: number
    ): Promise<[SendMessageResponse, Message]> {
        const dataClient = DataClient.create(this.identity, this.config);
        const uploadContentPromise = message.forwarded
            ? dataClient.forwardData(message.content, [this.userId, recipientId])
            : dataClient.uploadData(message.content, [this.userId, recipientId]);

        return uploadContentPromise.then((content) => {
            const newContent = content ?? message.content;
            const req: ApiSendMessageArgs = {
                content: apiMessageContent(newContent),
                recipient: Principal.fromText(recipientId),
                sender_name: sender.username,
                message_id: message.messageId,
                replies_to: apiOptional(
                    (replyContext) => apiReplyContextArgs(replyContext, replyingToChatId),
                    message.repliesTo
                ),
                forwarding: message.forwarded,
                thread_root_message_index: apiOptional(identity, threadRootMessageIndex),
                correlation_id: generateUint64(),
            };
            return this.handleResponse(this.userService.send_message(req), (resp) =>
                sendMessageResponse(resp, message.sender, recipientId)
            ).then((resp) => [resp, { ...message, content: newContent }]);
        });
    }

    @profile("userClient")
    sendGroupICPTransfer(
        groupId: string,
        recipientId: string,
        sender: CreatedUser,
        message: Message,
        threadRootMessageIndex?: number
    ): Promise<[SendMessageResponse, Message]> {
        const content = apiPendingCryptoContent(message.content as CryptocurrencyContent);

        const req: ApiTransferCryptoWithinGroupArgs = {
            thread_root_message_index: apiOptional(identity, threadRootMessageIndex),
            content,
            recipient: content.recipient,
            sender_name: sender.username,
            mentioned: [],
            message_id: message.messageId,
            group_id: Principal.fromText(groupId),
            replies_to: apiOptional(
                (replyContext) => apiReplyContextArgs(replyContext),
                message.repliesTo
            ),
            correlation_id: generateUint64(),
        };
        return this.handleResponse(this.userService.transfer_crypto_within_group_v2(req), (resp) =>
            transferWithinGroupResponse(resp, message.sender, recipientId)
        ).then((resp) => [resp, message]);
    }

    @profile("userClient")
    blockUser(userId: string): Promise<BlockUserResponse> {
        return this.handleResponse(
            this.userService.block_user({
                user_id: Principal.fromText(userId),
            }),
            blockResponse
        );
    }

    @profile("userClient")
    unblockUser(userId: string): Promise<UnblockUserResponse> {
        return this.handleResponse(
            this.userService.unblock_user({
                user_id: Principal.fromText(userId),
            }),
            unblockResponse
        );
    }

    @profile("userClient")
    leaveGroup(chatId: string): Promise<LeaveGroupResponse> {
        return this.handleResponse(
            this.userService.leave_group({
                chat_id: Principal.fromText(chatId),
                correlation_id: generateUint64(),
            }),
            leaveGroupResponse
        );
    }

    @profile("userClient")
    joinGroup(chatId: string, inviteCode: string | undefined): Promise<JoinGroupResponse> {
        return this.handleResponse(
            this.userService.join_group_v2({
                as_super_admin: false,
                chat_id: Principal.fromText(chatId),
                invite_code: apiOptional(textToCode, inviteCode),
                correlation_id: generateUint64(),
            }),
            joinGroupResponse
        );
    }

    @profile("userClient")
    markMessagesRead(request: MarkReadRequest): Promise<MarkReadResponse> {
        return this.handleResponse(
            this.userService.mark_read_v2({
                messages_read: request.map(({ chatId, readUpTo, threads }) => ({
                    chat_id: Principal.fromText(chatId),
                    read_up_to: apiOptional(identity, readUpTo),
                    threads: threads.map((t) => ({
                        root_message_index: t.threadRootMessageIndex,
                        read_up_to: t.readUpTo,
                    })),
                })),
            }),
            markReadResponse
        );
    }

    @profile("userClient")
    addReaction(
        otherUserId: string,
        messageId: bigint,
        reaction: string,
        username: string,
        threadRootMessageIndex?: number
    ): Promise<AddRemoveReactionResponse> {
        return this.handleResponse(
            this.userService.add_reaction({
                user_id: Principal.fromText(otherUserId),
                thread_root_message_index: apiOptional(identity, threadRootMessageIndex),
                message_id: messageId,
                reaction,
                username,
                correlation_id: generateUint64(),
            }),
            addRemoveReactionResponse
        );
    }

    @profile("userClient")
    removeReaction(
        otherUserId: string,
        messageId: bigint,
        reaction: string,
        threadRootMessageIndex?: number
    ): Promise<AddRemoveReactionResponse> {
        return this.handleResponse(
            this.userService.remove_reaction({
                user_id: Principal.fromText(otherUserId),
                thread_root_message_index: apiOptional(identity, threadRootMessageIndex),
                message_id: messageId,
                reaction,
                correlation_id: generateUint64(),
            }),
            addRemoveReactionResponse
        );
    }

    @profile("userClient")
    deleteMessage(
        otherUserId: string,
        messageId: bigint,
        threadRootMessageIndex?: number
    ): Promise<DeleteMessageResponse> {
        return this.handleResponse(
            this.userService.delete_messages({
                user_id: Principal.fromText(otherUserId),
                thread_root_message_index: apiOptional(identity, threadRootMessageIndex),
                message_ids: [messageId],
                correlation_id: generateUint64(),
            }),
            deleteMessageResponse
        );
    }

    @profile("userClient")
    searchAllMessages(searchTerm: string, maxResults = 10): Promise<SearchAllMessagesResponse> {
        const args = {
            search_term: searchTerm,
            max_results: maxResults,
        };
        return this.handleQueryResponse(
            () => this.userService.search_all_messages(args),
            searchAllMessagesResponse,
            args
        );
    }

    @profile("userClient")
    searchDirectChat(
        userId: string,
        searchTerm: string,
        maxResults: number
    ): Promise<SearchDirectChatResponse> {
        const args = {
            user_id: Principal.fromText(userId),
            search_term: searchTerm,
            max_results: maxResults,
        };
        return this.handleQueryResponse(
            () => this.userService.search_messages(args),
            searchDirectChatResponse,
            args
        );
    }

    @profile("userClient")
    toggleMuteNotifications(
        chatId: string,
        muted: boolean
    ): Promise<ToggleMuteNotificationResponse> {
        if (muted) {
            return this.handleResponse(
                this.userService.mute_notifications({
                    chat_id: Principal.fromText(chatId),
                }),
                muteNotificationsResponse
            );
        } else {
            return this.handleResponse(
                this.userService.unmute_notifications({
                    chat_id: Principal.fromText(chatId),
                }),
                muteNotificationsResponse
            );
        }
    }

    @profile("userClient")
    getRecommendedGroups(): Promise<GroupChatSummary[]> {
        const args = {
            count: 20,
        };
        return this.handleQueryResponse(
            () => this.userService.recommended_groups(args),
            recommendedGroupsResponse,
            args
        );
    }

    @profile("userClient")
    dismissRecommendation(chatId: string): Promise<void> {
        return this.handleResponse(
            this.userService.add_recommended_group_exclusions({
                duration: [],
                groups: [Principal.fromText(chatId)],
            }),
            toVoid
        );
    }

    @profile("userClient")
    getBio(): Promise<string> {
        return this.handleQueryResponse(
            () => this.userService.bio({}),
            (candid) => candid.Success
        );
    }

    @profile("userClient")
    getPublicProfile(): Promise<PublicProfile> {
        return this.handleQueryResponse(
            () => this.userService.public_profile({}),
            publicProfileResponse
        );
    }

    @profile("userClient")
    setBio(bio: string): Promise<SetBioResponse> {
        return this.handleResponse(this.userService.set_bio({ text: bio }), setBioResponse);
    }

    @profile("userClient")
    withdrawCryptocurrency(
        domain: PendingCryptocurrencyWithdrawal
    ): Promise<WithdrawCryptocurrencyResponse> {
        const req = {
            withdrawal: {
                NNS: apiPendingCryptocurrencyWithdrawal(domain),
            },
        };
        return this.handleResponse(
            this.userService.withdraw_crypto_v2(req),
            withdrawCryptoResponse
        );
    }

    @profile("userClient")
    pinChat(chatId: string): Promise<PinChatResponse> {
        return this.handleResponse(
            this.userService.pin_chat({
                chat_id: Principal.fromText(chatId),
            }),
            pinChatResponse
        );
    }

    @profile("userClient")
    unpinChat(chatId: string): Promise<UnpinChatResponse> {
        return this.handleResponse(
            this.userService.unpin_chat({
                chat_id: Principal.fromText(chatId),
            }),
            unpinChatResponse
        );
    }

    @profile("userClient")
    archiveChat(chatId: string): Promise<ArchiveChatResponse> {
        return this.handleResponse(
            this.userService.archive_chat({
                chat_id: Principal.fromText(chatId),
            }),
            archiveChatResponse
        );
    }

    @profile("userClient")
    unarchiveChat(chatId: string): Promise<ArchiveChatResponse> {
        return this.handleResponse(
            this.userService.unarchive_chat({
                chat_id: Principal.fromText(chatId),
            }),
            archiveChatResponse
        );
    }

    @profile("userClient")
    initUserPrincipalMigration(newPrincipal: string): Promise<void> {
        return this.handleResponse(
            this.userService.init_user_principal_migration({
                new_principal: Principal.fromText(newPrincipal),
            }),
            toVoid
        );
    }

    @profile("userClient")
    migrateUserPrincipal(): Promise<MigrateUserPrincipalResponse> {
        return this.handleResponse(
            this.userService.migrate_user_principal({}),
            migrateUserPrincipal
        );
    }
}