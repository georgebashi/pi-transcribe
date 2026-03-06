## ADDED Requirements

### Requirement: Live partial text preview in editor
The system SHALL display partial (in-progress) transcription text in the Pi prompt editor in real-time as the user speaks. Partial text SHALL be replaced as the recognizer refines its output.

#### Scenario: Partial transcription appears while speaking
- **WHEN** the transcription engine emits a partial result during recording
- **THEN** the system SHALL update the editor text to show: `[existing text][committed text][partial text]`
- **AND** the partial text SHALL be replaced on each update (not appended)

#### Scenario: Partial text cleared on endpoint
- **WHEN** the transcription engine finalizes a segment (endpoint detected)
- **THEN** the partial text region SHALL be cleared
- **AND** the finalized segment text SHALL be appended to the committed text

### Requirement: Finalized text committed to editor
The system SHALL permanently append finalized transcription segments to the editor content. Finalized text SHALL persist and not be overwritten by subsequent partial updates.

#### Scenario: Finalized segment appended to editor
- **WHEN** the transcription engine emits a finalized segment
- **THEN** the system SHALL append the segment text (with a leading space if needed) to the committed text region
- **AND** SHALL update the editor via `ctx.ui.setEditorText()`

#### Scenario: Multiple segments accumulate during recording
- **WHEN** the user speaks multiple sentences with pauses between them
- **THEN** each finalized segment SHALL be appended in order to the committed text
- **AND** the editor SHALL show the full accumulated transcription

### Requirement: Preserve existing editor content
The system SHALL preserve any text already present in the editor when dictation starts. Transcribed text SHALL be appended after the existing content.

#### Scenario: Editor has existing text when dictation starts
- **WHEN** the user activates dictation and the editor contains existing text
- **THEN** the system SHALL capture the existing text at dictation start
- **AND** SHALL append all transcription output after the existing text
- **AND** SHALL NOT modify or overwrite the existing text

#### Scenario: Editor is empty when dictation starts
- **WHEN** the user activates dictation and the editor is empty
- **THEN** transcription text SHALL appear from the beginning of the editor

### Requirement: Clean up on recording cancel
The system SHALL restore the editor to its pre-recording state when the user cancels dictation (e.g., via Escape).

#### Scenario: User cancels dictation via Escape
- **WHEN** the user presses Escape during recording
- **THEN** the system SHALL remove all transcription text (both committed and partial) from the editor
- **AND** SHALL restore the editor to the text it contained before dictation started

### Requirement: Recording indicator widget
The system SHALL display a visual widget above the editor during recording to indicate the current state.

#### Scenario: Widget shown during recording
- **WHEN** recording is active
- **THEN** the system SHALL display a widget above the editor showing `🎙️ Recording... (Ctrl+Shift+R to stop)`
- **AND** the widget SHALL use accent/highlight styling to be clearly visible

#### Scenario: Widget shown during final transcription
- **WHEN** recording stops and final decoding is in progress
- **THEN** the system SHALL briefly display `✨ Transcribing...` in the widget

#### Scenario: Widget hidden when idle
- **WHEN** recording is not active
- **THEN** the system SHALL hide the recording widget (set to undefined)

### Requirement: Engine status in footer
The system SHALL display the transcription engine state in the Pi footer status bar.

#### Scenario: Status shown during model loading
- **WHEN** the model is being loaded for the first time
- **THEN** the footer SHALL display `🎤 Loading model...`

#### Scenario: Status shown when ready
- **WHEN** the model is loaded and the system is idle
- **THEN** the footer SHALL display `🎤 Ready`

#### Scenario: Status shown during recording
- **WHEN** recording is active
- **THEN** the footer SHALL display `🎤 Recording`

#### Scenario: Status cleared after idle period
- **WHEN** recording stops and the system has been idle for more than 5 seconds
- **THEN** the footer status SHALL be cleared to avoid permanent clutter

### Requirement: Error notifications
The system SHALL display user-facing error notifications for all failure conditions using `ctx.ui.notify()`.

#### Scenario: Native module load failure
- **WHEN** the extension fails to load `sherpa-onnx-node` or `naudiodon2` native modules
- **THEN** the system SHALL display an error notification explaining the platform compatibility issue
- **AND** SHALL disable the dictation shortcut to prevent repeated errors

#### Scenario: Transcription error during recording
- **WHEN** an error occurs during audio processing or decoding while recording
- **THEN** the system SHALL stop recording gracefully
- **AND** SHALL display an error notification with the failure details
- **AND** SHALL preserve any already-committed transcription text in the editor
