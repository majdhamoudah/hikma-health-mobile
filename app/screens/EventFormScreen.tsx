import React, { FC, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { Alert, ViewStyle } from "react-native"
import { AppStackScreenProps } from "app/navigators"
import {
  Button,
  DiagnosisEditor,
  DiagnosisPickerButton,
  If,
  MedicationEditor,
  MedicationsFormItem,
  Screen,
  Text,
  TextField,
  Toggle,
  View,
} from "app/components"
import { useImmer } from "use-immer"
import database from "app/db"
import EventFormModel from "app/db/model/EventForm"
import { Picker } from "@react-native-picker/picker"
import EventModel from "app/db/model/Event"
import { Controller, useForm } from "react-hook-form"
import { translate } from "app/i18n"
import { colors } from "app/theme"
import { api } from "app/services/api"
import { useStores } from "app/models"
import { CommonActions } from "@react-navigation/native"
// import { useNavigation } from "@react-navigation/native"
// import { useStores } from "app/models"
import {
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet"
import { ICDEntry, MedicationEntry } from "app/types"
import { DatePickerButton } from "app/components/DatePicker"
import { isValid } from "date-fns"

// type ModalState = { activeModal: "medication" | "diagnosis" | null, medication: MedicationEntry | null, diagnoses: any[] }
type ModalState =
  | { activeModal: null }
  | { activeModal: "medication"; medication: MedicationEntry }
  | { activeModal: "diagnoses" }

interface EventFormScreenProps extends AppStackScreenProps<"EventForm"> { }

export const EventFormScreen: FC<EventFormScreenProps> = observer(function EventFormScreen({
  route,
  navigation,
}) {
  const {
    patientId,
    formId,
    visitId = null,
    // formData,
    eventId = null,
    visitDate,
  } = route.params
  const { provider, language } = useStores()

  const { register, reset, control, handleSubmit, setValue, getValues } = useForm<
    Record<string, string | number | Date | any[]>
  >({
    defaultValues: {},
  })
  const [diagnoses, setDiagnoses] = useState<ICDEntry[]>([])
  const [medicines, setMedicines] = useState<MedicationEntry[]>([])

  const { form, state: formState, isLoading } = useEventForm(formId, visitId, patientId, eventId)

  useEffect(() => {
    if (form && formState) {
      formState.formData.map((field) => {
        if (field.fieldType === "diagnosis") {
          setDiagnoses(field?.value || [])
        } else if (field.fieldType === "medicine") {
          setMedicines(field?.value || [])
        }
        setValue(field.name, field.value)
      })
    }
  }, [formState, form])

  const [loading, setLoading] = useState(false)
  const [modalState, updateModalState] = useImmer<ModalState>({
    activeModal: null,
  })
  useEffect(() => {
    if (modalState.activeModal) {
      bottomSheetModalRef.current?.present()
    } else {
      bottomSheetModalRef.current?.dismiss()
    }
  }, [modalState.activeModal])
  const canSaveForm = useMemo(() => {
    if (loading) {
      return false
    }
    return form?.isEditable ?? false
  }, [form?.isEditable, loading])

  const onSubmit = async (data: Record<string, any>) => {
    if (loading) {
      return
    }

    const formData =
      form?.formFields
        .map((field) => ({
          fieldId: field.id,
          fieldType: field.fieldType,
          value: data[field.name] || "",
          inputType: field.inputType,
          name: field.name,
        }))
        .filter(
          (field) =>
            field.name.toLowerCase() !== "diagnosis" &&
            field.name.toLowerCase() !== "medications" &&
            field.fieldType.toLowerCase() !== "diagnosis" &&
            field.name.toLowerCase() !== "medicine" &&
            field.fieldType.toLowerCase() !== "medicine"
        ) || []

    // if the form has medicine and diagnosis fields, add them to the form data
    const medicineField = form?.formFields.find((field) => field.fieldType === "medicine")
    const diagnosisField = form?.formFields.find((field) => field.fieldType === "diagnosis")
    if (medicineField) {
      // add the medications state array to the form data
      formData.push({
        fieldId: medicineField.id,
        value: medicines,
        fieldType: medicineField.fieldType,
        inputType: "input-group",
        name: medicineField.name,
      })
    }
    if (diagnosisField) {
      // add the diagnoses state array to the form data
      formData.push({
        fieldId: diagnosisField.id,
        value: diagnoses,
        fieldType: diagnosisField.fieldType,
        inputType: "input-group",
        name: diagnosisField.name,
      })
    }

    const newEvent: EventModel = {
      formId,
      visitId,
      eventType: form?.name || "",
      patientId,
      formData,
      visitDate,
    }

    try {
      const res = await api.createEvent(
        newEvent,
        visitId,
        provider.clinic_id,
        provider.id,
        provider.name,
        visitDate,
        eventId,
      )

      // React-Navigation 6 shortcut to passing a parameter to the previous screen
      // here we pop the screen and pass the visit ID to the previous screen
      navigation.dispatch((state) => {
        const prevRoute = state.routes[state.routes.length - 2]
        return CommonActions.navigate({
          name: prevRoute.name,
          params: {
            ...prevRoute.params,
            visitId: res.visitId,
          },
          merge: true,
        })
      })
    } catch (e) {
      console.error(e)
      Alert.alert("Error connecting to the database")
    }

    // setLoading(true)
  }

  // set the title of the page
  useEffect(() => {
    navigation.setOptions({
      title: form?.name ?? "Event Form",
    })
  }, [form?.name])

  // ref
  const bottomSheetModalRef = useRef<BottomSheetModal>(null)

  // variables
  const snapPoints = useMemo(() => ["100%", "100%"], [])

  // callbacks
  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present()
  }, [])
  const handleSheetChanges = useCallback((index: number) => {
    console.log("handleSheetChanges", index)
    if (index === -1) {
      updateModalState((draft) => {
        draft.activeModal = null
      })
    }
  }, [])

  const openMedicationEditor = (medication?: MedicationEntry) => {
    updateModalState((draft) => {
      draft.activeModal = "medication"
      if (draft.activeModal === "medication" && medication) {
        draft.medication = medication
      }
    })
  }

  const openDiagnosesEditor = () => {
    updateModalState((draft) => {
      draft.activeModal = "diagnoses"
    })
  }

  const updateDiagnoses = (diagnoses: ICDEntry[]) => {
    setDiagnoses(diagnoses)
    updateModalState((draft) => {
      draft.activeModal = null
    })
  }

  const updateMedication = (medication: MedicationEntry) => {
    // set the medication in the form
    // setValue("medicine" as never, medication)
    // the form has a medicine field that is an array of medications, so we need to get the current value of the field and add the new medication to it if the current array does not have the same medication id
    const currentMedications = medicines
    const medicationExists = currentMedications.find((m: MedicationEntry) => m.id === medication.id)
    if (!medicationExists) {
      setMedicines((meds) => [...meds, medication])
    } else {
      setMedicines((meds) => meds.map((m) => (m.id === medication.id ? medication : m)))
    }
    updateModalState((draft) => {
      draft.activeModal = null
    })
  }

  if (isLoading) return <Text>Loading...</Text>
  if (!form) return <Text>Form not found</Text>

  return (
    <BottomSheetModalProvider>
      <Screen style={$root} preset="scroll">
        <View gap={12} pb={24}>
          {form.formFields.map((field, idx) => {
            return (
              <View key={`formField-${idx}`}>
                <If condition={field.inputType === "text" || field.inputType === "number"}>
                  <Controller
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextField
                        label={field.name}
                        onChangeText={onChange}
                        keyboardType={field.inputType === "number" ? "number-pad" : "default"}
                        onBlur={onBlur}
                        value={value}
                      />
                    )}
                    name={field.name as never}
                    control={control}
                  />
                </If>
                <If condition={field.inputType === "textarea"}>
                  <Controller
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextField
                        label={field.name}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        value={value}
                        multiline
                      />
                    )}
                    name={field.name as never}
                    control={control}
                  />
                </If>
                <If condition={field.inputType === "select" && field.fieldType !== "diagnosis"}>
                  <Controller
                    render={({ field: { onChange, value } }) => (
                      <View style={{}}>
                        <Text text={field.name} preset="formLabel" />
                        <View
                          style={{
                            marginTop: 4,
                            borderWidth: 1,
                            borderRadius: 4,
                            backgroundColor: colors.palette.neutral200,
                            borderColor: colors.palette.neutral400,
                            overflow: "hidden",
                          }}
                        >
                          <Picker selectedValue={value} onValueChange={onChange}>
                            <Picker.Item label="Select an option" value="" />
                            {field.options?.map((option, idx) => (
                              <Picker.Item
                                key={option.value}
                                label={option.label}
                                value={option.value}
                              />
                            ))}
                          </Picker>
                        </View>
                      </View>
                    )}
                    name={field.name as never}
                    control={control}
                  />
                </If>

                <If condition={field.inputType === "checkbox"}>
                  <Controller
                    render={({ field: { onChange, value } }) => (
                      <View gap={4}>
                        <Text text={field.name} preset="formLabel" />
                        <View mt={4} />
                        {field.options?.map((option, idx) => (
                          <Toggle
                            key={option.value}
                            label={option.label}
                            value={value === option.value}
                            onValueChange={(value) => {
                              if (value) {
                                setValue(field.name as never, option.value as never)
                              }
                            }}
                          />
                        ))}
                      </View>
                    )}
                    name={field.name as never}
                    control={control}
                  />
                </If>

                <If condition={field.inputType === "date"}>
                  <Controller
                    render={({ field: { onChange, value } }) => (
                      <View style={{}}>
                        <Text text={field.name} preset="formLabel" />
                        <View>
                          <DatePickerButton
                            date={isValid(new Date(value)) ? new Date(value) : new Date()}
                            mode="date"
                            theme="light"
                            onDateChange={onChange}
                          />
                        </View>
                      </View>
                    )}
                    name={field.name as never}
                    control={control}
                  />
                </If>

                <If condition={field.inputType === "radio"}>
                  <Controller
                    render={({ field: { onChange, value } }) => (
                      <View gap={4}>
                        <Text text={field.name} preset="formLabel" />
                        <View mt={4} />
                        {field.options?.map((option, idx) => (
                          <Toggle
                            key={option.value}
                            variant="radio"
                            label={option.label}
                            value={value === option.value}
                            onValueChange={(value) => {
                              if (value) {
                                setValue(field.name as never, option.value as never)
                              }
                            }}
                          />
                        ))}
                      </View>
                    )}
                    name={field.name as never}
                    control={control}
                  />
                </If>

                <If condition={field.inputType === "input-group" && field.fieldType === "medicine"}>
                  <MedicationsFormItem
                    openMedicationEditor={openMedicationEditor}
                    deleteEntry={(med) => {
                      setMedicines((meds) => meds.filter((m) => m.id !== med))
                    }}
                    value={medicines}
                    onEditEntry={(med) => openMedicationEditor(med)}
                    viewOnly={false}
                  />
                </If>

                <If condition={field.fieldType === "diagnosis"}>
                  <DiagnosisPickerButton
                    language={language.current}
                    openDiagnosisPicker={openDiagnosesEditor}
                    key={field.id}
                    value={diagnoses || []}
                  />
                </If>
              </View>
            )
          })}

          <Button
            preset="default"
            disabled={!canSaveForm}
            onPress={handleSubmit(onSubmit)}
            testID="submit"
          >
            {loading ? translate("loading") : translate("save")}
          </Button>
        </View>
      </Screen>
      <BottomSheetModal
        ref={bottomSheetModalRef}
        index={1}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
      >
        <BottomSheetScrollView style={{}}>
          <If condition={modalState.activeModal === "medication"}>
            <MedicationEditor medication={modalState.medication} onSubmit={updateMedication} />
          </If>
          <If condition={modalState.activeModal === "diagnoses"}>
            <DiagnosisEditor
              language={language.current}
              onSubmit={updateDiagnoses}
              diagnoses={diagnoses}
            />
          </If>
        </BottomSheetScrollView>
      </BottomSheetModal>
    </BottomSheetModalProvider>
  )
})

// TODO: Add support for the following
// - [ ] Date input
// - [ ] Diagnosis input
// - [ ] Medication input
// - [ ] Update radio & checkbox options
// - [ ] Support for editing an existing event

type EventFormState = {
  form: EventFormModel | null
  fields: EventFormModel["formFields"]
  setFieldValue: (fieldId: string, value: any) => void
  getFieldValue: (fieldId: string) => any
  state: EventModel | null
  isLoading: boolean
}

// FIXME: MUST REFACTOR & remove all unused code
/**
 * Hook to manage and update an event form
 * TODO: add support for editing an existing event form
 *
 * @param formId - The form ID
 * @param visitId - The visit ID
 * @param patientId - The patient ID
 * @param eventId - If this is an existing event, the event ID to edit or null if this is a new event
 */
function useEventForm(
  formId: string,
  visitId: string | null,
  patientId: string,
  eventId: string | null,
): EventFormState {
  const [form, setForm] = useState<EventFormModel | null>(null)
  const [formState, updateFormState] = useImmer<EventModel | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)

  useEffect(() => {
    /** Subscribe to the form */
    const formSub = database.collections
      .get<EventFormModel>("event_forms")
      .findAndObserve(formId)
      .subscribe((form) => {
        setForm(form)
        if (!eventId) {
          const state = form.formFields.map((field) => ({
            fieldId: field.id,
            value: null,
            inputType: field.inputType,
            name: field.name,
          }))
          // updateFormState(() => ({
          //   ...defaultEvent,
          //   formId,
          //   visitId,
          //   patientId,
          //   formData: state,
          // }))

          updateFormState((draft) => {
            // draft.formId = event.formId
            // draft.visitId = event.visitId
            // draft.patientId = event.patientId
            // draft.formData = event.formData
            // draft.createdAt = event.createdAt
            // draft.updatedAt = event.updatedAt
            // draft.id = event.id
            // return draft
          })
          // }
        }
        setIsLoading(false)
      })

    /** Subscribe to the event if it exists. If there is no event, create a new one */
    const eventSub = eventId
      ? database.collections
        .get<EventModel>("events")
        .findAndObserve(eventId)
        .subscribe((event) => {
          updateFormState((d) => {
            let draft = d || ({} as any)
            // if (draft) {
            draft.formId = event.formId
            draft.visitId = event.visitId
            draft.patientId = event.patientId
            draft.formData = event.formData
            draft.createdAt = event.createdAt
            draft.updatedAt = event.updatedAt
            draft.id = event.id
            return draft
            // }
            // return event
          })
        })
      : null

    return () => {
      formSub.unsubscribe()
      eventSub?.unsubscribe()
      setIsLoading(true)
      setForm(null)
    }
  }, [formId, eventId])

  const getFieldValue = useCallback(
    (fieldId: string) => {
      return formState?.formData.find((field) => field.fieldId === fieldId)?.value
    },
    [formState?.formData],
  )

  const setFieldValue = useCallback((fieldId: string, value: any) => {
    updateFormState((draft) => {
      if (draft) {
        const field = draft.formData.find((field) => field.fieldId === fieldId)
        if (field) {
          field.value = value
        }
      }
    })
  }, [])

  return {
    form: form,
    isLoading,
    // fields: form?.formFields ?? [],
    state: formState,
    // getFieldValue: getFieldValue,
    // setFieldValue,
  }
}

const $root: ViewStyle = {
  flex: 1,
  padding: 10,
}
