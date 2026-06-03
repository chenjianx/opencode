import type { RaccoonAgent, RaccoonModel } from "../../protocol"
import { useLanguage } from "../../context/language"
import { ModelPicker } from "../ui/model-picker"
import { SettingsRow } from "./settings-common"

type ModelSelection = { providerID: string; modelID: string }

function labelOf(model: RaccoonModel | undefined, notSet: string) {
  if (!model) return notSet
  return model.modelName
}

function modeLabel(value: string) {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function SettingsModels(props: {
  agents: RaccoonAgent[]
  connectedModels: RaccoonModel[]
  selectedModel?: ModelSelection
  modeModels: Partial<Record<string, ModelSelection>>
  onSelectedModelChange: (model: ModelSelection) => void
  onModeModelChange: (mode: string, model: ModelSelection) => void
}) {
  const language = useLanguage()
  const selectedModel = props.connectedModels.find(
    (model) => model.providerID === props.selectedModel?.providerID && model.modelID === props.selectedModel?.modelID,
  )
  const modeModel = (mode: string) =>
    props.connectedModels.find(
      (model) =>
        model.providerID === props.modeModels[mode]?.providerID &&
        model.modelID === props.modeModels[mode]?.modelID,
    )

  return (
    <>
      <h3>{language.t("settings.models.title")}</h3>
      <div className="settings-card settings-model-card">
        <SettingsRow title={language.t("settings.models.default.title")} description={language.t("settings.models.default.description")}>
          <ModelPicker
            value={props.selectedModel}
            models={props.connectedModels}
            onChange={props.onSelectedModelChange}
            ariaLabel={language.t("settings.models.default.title")}
            placeholder={language.t("settings.models.noModel")}
            compact
            placement="bottom"
            maxWidth={255}
          />
        </SettingsRow>
        {props.agents.map((agent) => (
          <SettingsRow
            key={agent.name}
            title={`${modeLabel(agent.name)} model`}
            description={
              agent.description
                ? `${agent.description} ${language.t("settings.models.current", {
                    model: labelOf(modeModel(agent.name) ?? selectedModel, language.t("settings.models.notSet")),
                  })}`
                : language.t("settings.models.current", {
                    model: labelOf(modeModel(agent.name) ?? selectedModel, language.t("settings.models.notSet")),
                  })
            }
          >
            <ModelPicker
              value={props.modeModels[agent.name] ?? props.selectedModel}
              models={props.connectedModels}
              onChange={(model) => props.onModeModelChange(agent.name, model)}
              ariaLabel={`${modeLabel(agent.name)} model`}
              placeholder={language.t("settings.models.noModel")}
              compact
              placement="bottom"
              maxWidth={255}
            />
          </SettingsRow>
        ))}
      </div>
    </>
  )
}
