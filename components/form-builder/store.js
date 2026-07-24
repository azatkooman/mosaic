import { create } from 'zustand'
import { DEFAULT_ADDRESS_PARTS } from '@/lib/form-engine/address'

/**
 * Draft form definition editor state with a simple undo stack.
 * The definition mirrors form_versions.definition; autosave is debounced
 * in the FormBuilder component.
 */
export const useBuilderStore = create((set, get) => ({
  definition: { questions: [] },
  selectedId: null,
  past: [],
  future: [],
  dirty: false,

  init(definition) {
    set({ definition, selectedId: null, past: [], future: [], dirty: false })
  },

  _commit(nextDefinition, extra = {}) {
    const { definition, past } = get()
    set({
      definition: nextDefinition,
      past: [...past.slice(-49), definition],
      future: [],
      dirty: true,
      ...extra,
    })
  },

  addQuestion(type) {
    const id = `q_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
    const question = {
      id,
      type,
      label: {},
      ...(['select', 'multiselect', 'radio'].includes(type) ? { options: [] } : {}),
      ...(type === 'name' ? { nameFormat: 'first_last', required: true } : {}),
      ...(type === 'address'
        ? { addressParts: structuredClone(DEFAULT_ADDRESS_PARTS) }
        : {}),
    }
    const def = get().definition
    get()._commit({ ...def, questions: [...def.questions, question] }, { selectedId: id })
  },

  updateQuestion(id, patch) {
    const def = get().definition
    get()._commit({
      ...def,
      questions: def.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)),
    })
  },

  replaceDefinition(nextDefinition) {
    const { definition } = get()
    if (definition === nextDefinition) return
    get()._commit(nextDefinition)
  },

  removeQuestion(id) {
    const def = get().definition
    // Also strip visibility rules that reference the deleted question —
    // an orphaned rule evaluates false forever and permanently hides the
    // dependent question for every registrant.
    const questions = def.questions
      .filter((q) => q.id !== id)
      .map((q) => {
        if (!q.visibleIf?.rules?.some((r) => r.questionId === id)) return q
        const rules = q.visibleIf.rules.filter((r) => r.questionId !== id)
        const { visibleIf, ...rest } = q
        return rules.length ? { ...rest, visibleIf: { ...visibleIf, rules } } : rest
      })
    get()._commit({ ...def, questions }, { selectedId: null })
  },

  moveQuestion(activeId, overId) {
    const def = get().definition
    const ids = def.questions.map((q) => q.id)
    const from = ids.indexOf(activeId)
    const to = ids.indexOf(overId)
    if (from === -1 || to === -1 || from === to) return
    const questions = [...def.questions]
    const [moved] = questions.splice(from, 1)
    questions.splice(to, 0, moved)
    get()._commit({ ...def, questions })
  },

  select(id) {
    set({ selectedId: id })
  },

  undo() {
    const { past, definition, future } = get()
    if (!past.length) return
    set({
      definition: past[past.length - 1],
      past: past.slice(0, -1),
      future: [definition, ...future],
      dirty: true,
    })
  },

  redo() {
    const { future, definition, past } = get()
    if (!future.length) return
    set({
      definition: future[0],
      future: future.slice(1),
      past: [...past, definition],
      dirty: true,
    })
  },

  markSaved() {
    set({ dirty: false })
  },
}))
