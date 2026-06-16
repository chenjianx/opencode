/**
 * Autocomplete (FIM) model definitions for raccoon.
 *
 * The backend `POST /fim` endpoint drives the raccoon completion model. When
 * adding a model, update this file and the `raccoon.autocomplete.model` enum in
 * package.json.
 */

export interface AutocompleteModelDef {
  /** Model ID sent to the backend, e.g. "raccoon-pro-completion" */
  readonly id: string
  /** Human-readable label shown in settings */
  readonly label: string
  /** FIM request temperature */
  readonly temperature: number
}

const models: AutocompleteModelDef[] = [
  {
    id: "raccoon-pro-completion",
    label: "Raccoon Complete Pro",
    temperature: 0.01,
  },
  {
    id: "raccoon-completion",
    label: "Raccoon Complete",
    temperature: 0.01,
  },
]

export const AUTOCOMPLETE_MODELS: readonly AutocompleteModelDef[] = models

export const DEFAULT_AUTOCOMPLETE_MODEL: AutocompleteModelDef = models[0]!

export function getAutocompleteModel(id: string): AutocompleteModelDef {
  for (const m of models) {
    if (m.id === id) return m
  }
  return DEFAULT_AUTOCOMPLETE_MODEL
}
