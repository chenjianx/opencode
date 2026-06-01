import type { ChatMode, RaccoonModel } from "../../protocol"
import { useLanguage } from "../../context/language"
import { ModelPicker } from "../ui/model-picker"
import { SettingsRow } from "./settings-common"

type ModelSelection = { providerID: string; modelID: string }

function labelOf(model: RaccoonModel | undefined, notSet: string) {
  if (!model) return notSet
  return model.modelName
}

export function SettingsModels(props: {
  connectedModels: RaccoonModel[]
  selectedModel?: ModelSelection
  modeModels: Partial<Record<ChatMode, ModelSelection>>
  onSelectedModelChange: (model: ModelSelection) => void
  onModeModelChange: (mode: ChatMode, model: ModelSelection) => void
}) {
  const language = useLanguage()
  const selectedModel = props.connectedModels.find(
    (model) => model.providerID === props.selectedModel?.providerID && model.modelID === props.selectedModel?.modelID,
  )
  const modeModel = (mode: ChatMode) =>
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
        <SettingsRow
          title={language.t("settings.models.build.title")}
          description={language.t("settings.models.current", {
            model: labelOf(modeModel("build") ?? selectedModel, language.t("settings.models.notSet")),
          })}
        >
          <ModelPicker
            value={props.modeModels.build ?? props.selectedModel}
            models={props.connectedModels}
            onChange={(model) => props.onModeModelChange("build", model)}
            ariaLabel={language.t("settings.models.build.title")}
            placeholder={language.t("settings.models.noModel")}
            compact
            placement="bottom"
            maxWidth={255}
          />
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.models.plan.title")}
          description={language.t("settings.models.current", {
            model: labelOf(modeModel("plan") ?? selectedModel, language.t("settings.models.notSet")),
          })}
        >
          <ModelPicker
            value={props.modeModels.plan ?? props.selectedModel}
            models={props.connectedModels}
            onChange={(model) => props.onModeModelChange("plan", model)}
            ariaLabel={language.t("settings.models.plan.title")}
            placeholder={language.t("settings.models.noModel")}
            compact
            placement="bottom"
            maxWidth={255}
          />
        </SettingsRow>
      </div>
    </>
  )
}
