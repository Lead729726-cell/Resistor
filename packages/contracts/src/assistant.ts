export interface AssistantContext {cell_name?:string;device_ids?:string[];net_names?:string[];shape_ids?:string[]}
export interface AssistantReference {id:string;kind:'design'|'connectivity'|'device'|'net'|'shape'|'run'|'issue';label:string;target:string;cell_name?:string|null}
export interface AssistantFinding {severity:'info'|'warning'|'error';title:string;explanation:string;evidence_ids:string[];suggested_check:string}
export interface AssistantReview {summary:string;findings:AssistantFinding[];limitations:string[]}
export interface AssistantSampleSummary {name:string;unit:string;available:boolean;min?:number;max?:number;last?:number;samples?:number}
export interface AssistantEvidence {
  product:{id:string;edition:'edu'|'indust';name:string};project:{id:string;name:string;cell:string;revision:number};context:AssistantContext;
  selection:{shapes:{id:string;layer_id:string;net:string|null;bbox_dbu:string[];dbu_um:number}[];unavailable_shape_ids:string[]};
  connectivity:{device_count:number;net_count:number;truncated:boolean;scope:string;devices:{id:string;name:string;kind:string;selected:boolean}[]};
  issues:{code:string;severity:string;message:string;kind?:string;net?:string;run_id?:string}[];
  runs:{id:string;kind:string;revision:number;freshness:'current'|'stale';execution_status:string;analysis_result:string;tool?:string;waveform_summary:AssistantSampleSummary[];current_flow_summary?:{available:boolean;branches?:{name:string;from_net:string;to_net:string;current:AssistantSampleSummary;voltage_drop:Partial<AssistantSampleSummary>}[]}}[];
  references:AssistantReference[];evidence_ids:string[];fingerprint:string;limits:string[];
}
export interface AssistantProviderStatus {openai:{configured:boolean;model:string;roles?:Record<'decision'|'execution',{model:string;input:number;output:number;checked:string}>;budget_usd:number;remaining_usd:number;reserved_usd:number};ollama:{available:boolean;models:string[];selected_model:string|null}}
export interface AssistantReviewReceipt {id:string;provider:string;model:string;revision:number;evidence_hash:string;freshness:'current'|'stale';review:AssistantReview;budget_reservation:{reserved_usd:number}|null}
export interface AssistantDiagnosis {evidence:AssistantEvidence;source:'deterministic';advisory_only:true;engine_executed:false;review:AssistantReview}
export interface AssistantChatReply {answer:string;evidence_ids:string[];findings:AssistantFinding[];follow_up_questions:string[];limitations:string[]}
export interface AssistantChatTurn {id:string;question:string;reply:AssistantChatReply;provider:'openai'|'ollama';model:string;usage:Record<string,number>;budget_reservation:{reserved_usd:number}|null;created_at:string}
export interface AssistantConversation {id:string;project_id:string;product_id:string;revision:number;context:AssistantContext;evidence_hash:string;evidence:AssistantEvidence;turns:AssistantChatTurn[];freshness:'current'|'stale';advisory_only:true;engine_executed:false;history_window?:{included_turns:number;total_turns:number}}
export interface AssistantConversationSummary {id:string;revision:number;context:AssistantContext;turn_count:number;last_question:string;updated_at:string;freshness:'current'|'stale'}
export type AssistantActionKind='change_parameter'|'simulation'|'drc'|'lvs'|'pex';
export interface AssistantModelStage {model:string;status:'not_run'|'running'|'completed'|'failed';usage?:Record<string,number>;budget_reservation?:{reserved_usd:number}|null}
export interface AssistantWorkflow {
  id:string;product_id:string;project_id:string;revision:number;context:AssistantContext;goal:string;evidence_hash:string;freshness?:'current'|'stale';plan_hash?:string;created_at:string;updated_at:string;
  decision:AssistantModelStage;proposal:AssistantModelStage;
  decision_result?:{verdict:'proceed'|'needs_input';summary:string;rationale:string;action_kind:AssistantActionKind;evidence_ids:string[];questions:string[];limitations:string[]};
  proposal_result?:{summary:string;action:{kind:AssistantActionKind;device_id:string|null;parameter:'value'|'dc'|null;value:number|null};evidence_ids:string[];expected_effect:string;limitations:string[]};
  before?:{device_id:string;name:string;parameter:string;value:number;unit:string};
  engine:{status:'not_run'|'running'|'completed'|'failed'|'unknown';command_id:string;result_revision?:number;run?:{id:string;revision:number;kind:string;execution_status:string;analysis_result:string;tool?:string;message?:string};error?:{code:string;message:string}};
  error?:{code:string;message:string};
}
