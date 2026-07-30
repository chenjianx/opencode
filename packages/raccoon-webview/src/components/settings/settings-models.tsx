import type { RaccoonAgent, RaccoonModel } from "../../protocol"
import { useLanguage } from "../../context/language"
import { ModelPicker } from "../ui/model-picker"
import { SettingsRow } from "./settings-common"
import { titleCase } from "./utils"
import { agentDisplayDescription } from "../../agent-description"

type ModelSelection = { providerID: string; modelID: string }

function labelOf(model: RaccoonModel | undefined, notSet: string) {
  if (!model) return notSet
  return model.modelName
}

export function SettingsModels(props: {
  agents: RaccoonAgent[]
  connectedModels: RaccoonModel[]
  selectedModel?: ModelSelection
  modeModels: Partial<Record<string, ModelSelection>>
  onSelectedModelChange: (model: ModelSelection) => void
  onModeModelChange: (mode: string, model: ModelSelection) => void
  onModeModelClear: (mode: string) => void
}) {
  const language = useLanguage()
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
      </div>

      <h4>{language.t("settings.models.modes.title")}</h4>
      <div className="settings-card settings-model-card">
        {props.agents.map((agent) => {
          const configured = modeModel(agent.name)
          const status = props.modeModels[agent.name]
            ? language.t("settings.models.current", { model: labelOf(configured, language.t("settings.models.notSet")) })
            : language.t("settings.models.usesDefault")
          const description = agentDisplayDescription(agent, language.t)
          return (
            <SettingsRow
              key={agent.name}
              title={language.t("settings.models.modeModel", { mode: titleCase(agent.name) })}
              description={description ? `${description} ${status}` : status}
            >
              <ModelPicker
                value={props.modeModels[agent.name]}
                models={props.connectedModels}
                onChange={(model) => props.onModeModelChange(agent.name, model)}
                ariaLabel={language.t("settings.models.modeModel", { mode: titleCase(agent.name) })}
                placeholder={language.t("settings.models.noModel")}
                allowUnset
                unsetLabel={language.t("settings.models.unconfigured")}
                onUnset={() => props.onModeModelClear(agent.name)}
                compact
                placement="bottom"
                maxWidth={255}
              />
            </SettingsRow>
          )
        })}
      </div>
    </>
  )
}
