import { supabase } from '../lib/supabase';

// Phase 2 tables are deliberately kept separate from the legacy Product
// preparation_options field. Checkout does not import this module yet.
const db = supabase as unknown;

export type PrepOptionDraft = { code: string; label: string; label_ms: string };
export type PrepQuestionDraft = {
  code: string; label: string; label_ms: string; help_text: string; help_text_ms: string;
  answer_type: 'boolean' | 'single_select' | 'multi_select' | 'integer' | 'decimal' | 'text';
  selection_scope: 'line' | 'physical_unit'; required: boolean; options: PrepOptionDraft[];
};
export type PreparationVersion = { id: string; preparation_schema_id: string; version_number: number; status: string; title: string; title_ms: string; effective_from: string };
export type PreparationSchema = { id: string; code: string; name: string; name_ms: string; description: string; description_ms: string; active: boolean; preparation_schema_versions: PreparationVersion[] };

export async function listPreparationSchemas(): Promise<PreparationSchema[]> {
  const { data, error } = await db.from('preparation_schemas').select('*, preparation_schema_versions(id, preparation_schema_id, version_number, status, title, title_ms, effective_from)').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function createPreparationSchema(input: { code: string; name: string; name_ms: string; description: string; description_ms: string }) {
  const { data: schema, error } = await db.from('preparation_schemas').insert(input).select().single();
  if (error) throw error;
  const { data: version, error: versionError } = await db.from('preparation_schema_versions').insert({ preparation_schema_id: schema.id, version_number: 1, title: input.name, title_ms: input.name_ms }).select().single();
  if (versionError) throw versionError;
  return { schema, version };
}

export async function createDraftVersion(schema: PreparationSchema) {
  const next = Math.max(0, ...(schema.preparation_schema_versions ?? []).map((v) => v.version_number)) + 1;
  const { data, error } = await db.from('preparation_schema_versions').insert({ preparation_schema_id: schema.id, version_number: next, title: schema.name, title_ms: schema.name_ms }).select().single();
  if (error) throw error;
  return data as PreparationVersion;
}

export async function loadVersionQuestions(versionId: string) {
  const { data, error } = await db.from('preparation_questions').select('*, preparation_question_options(*)').eq('preparation_schema_version_id', versionId).order('display_order');
  if (error) throw error;
  return data ?? [];
}

export async function replaceDraftQuestions(versionId: string, questions: PrepQuestionDraft[]) {
  const { data: version, error: versionError } = await db.from('preparation_schema_versions').select('status').eq('id', versionId).single();
  if (versionError) throw versionError;
  if (version.status !== 'draft') throw new Error('Published versions are immutable. Create a new draft version instead.');
  const { data: existing, error: existingError } = await db.from('preparation_questions').select('id').eq('preparation_schema_version_id', versionId);
  if (existingError) throw existingError;
  const ids = (existing ?? []).map((q: { id: string }) => q.id);
  if (ids.length) {
    const { error } = await db.from('preparation_question_options').delete().in('preparation_question_id', ids);
    if (error) throw error;
    const { error: questionError } = await db.from('preparation_questions').delete().eq('preparation_schema_version_id', versionId);
    if (questionError) throw questionError;
  }
  for (const [display_order, question] of questions.entries()) {
    const { data: created, error } = await db.from('preparation_questions').insert({ ...question, options: undefined, preparation_schema_version_id: versionId, display_order }).select().single();
    if (error) throw error;
    if (question.options.length) {
      const { error: optionError } = await db.from('preparation_question_options').insert(question.options.map((option, display_order) => ({ ...option, preparation_question_id: created.id, value: option.code, display_order })));
      if (optionError) throw optionError;
    }
  }
}

export async function publishPreparationVersion(versionId: string) {
  const { error } = await db.rpc('publish_preparation_schema_version', { p_version_id: versionId });
  if (error) throw error;
}

export async function assignPublishedSchema(productId: string, versionId: string, physicalUnitType: 'chicken' | 'fish' | 'other' = 'other') {
  const { data: versions, error: readError } = await db.from('product_versions').select('version_number').eq('product_id', productId);
  if (readError) throw readError;
  const version_number = Math.max(0, ...(versions ?? []).map((v: { version_number: number }) => v.version_number)) + 1;
  const { error } = await db.from('product_versions').insert({ product_id: productId, version_number, status: 'published', preparation_schema_version_id: versionId, physical_unit_type: physicalUnitType, configuration: {}, display_snapshot: {} });
  if (error) throw error;
}
