## ADDED Requirements

### Requirement: Lazy model loading on first use
The system SHALL load the sherpa-onnx OnlineRecognizer model lazily — only when the user first activates dictation, not at extension startup. The model SHALL remain loaded in memory for the duration of the Pi session to avoid repeated load times.

#### Scenario: First dictation activation triggers model load
- **WHEN** the user activates dictation for the first time in a session
- **AND** model files exist in the configured model directory
- **THEN** the system SHALL create an `OnlineRecognizer` with the configured model files
- **AND** SHALL display a status indicator ("Loading model...") during initialization

#### Scenario: Subsequent dictation activations reuse loaded model
- **WHEN** the user activates dictation and the model is already loaded
- **THEN** the system SHALL reuse the existing `OnlineRecognizer` instance without reloading

#### Scenario: Model files not found on first activation
- **WHEN** the user activates dictation and model files are not present in the model directory
- **THEN** the system SHALL display a notification directing the user to run `/transcribe-setup`
- **AND** SHALL NOT attempt to create the recognizer

### Requirement: Real-time streaming decoding
The system SHALL feed audio samples to sherpa-onnx's `OnlineRecognizer` and decode them in real-time, producing partial transcription results as speech is recognized.

#### Scenario: Audio samples are fed and decoded incrementally
- **WHEN** audio samples arrive from the audio capture module
- **THEN** the system SHALL call `stream.acceptWaveform()` with the sample rate and samples
- **AND** SHALL call `recognizer.decode(stream)` while `recognizer.isReady(stream)` is true
- **AND** SHALL retrieve the current result via `recognizer.getResult(stream)`

#### Scenario: Partial results update during speech
- **WHEN** the recognizer decodes new audio and the result text changes
- **THEN** the system SHALL emit the updated text as a partial (draft) result to the editor integration module

### Requirement: Endpoint detection and segment finalization
The system SHALL use sherpa-onnx's endpoint detection to identify when a speech segment is complete. Finalized segments SHALL be distinguished from partial (in-progress) results.

#### Scenario: Endpoint detected during continuous speech
- **WHEN** the recognizer detects an endpoint (trailing silence exceeds threshold)
- **THEN** the system SHALL emit the segment text as a finalized result
- **AND** SHALL reset the recognizer stream via `recognizer.reset(stream)` for the next segment
- **AND** SHALL increment the internal segment counter

#### Scenario: Recording stops with unfinalised audio
- **WHEN** the user stops recording and there is text in the current partial result
- **THEN** the system SHALL finalize the remaining partial text as a completed segment
- **AND** SHALL emit it to the editor integration module

### Requirement: Model download via setup command
The system SHALL provide a `/transcribe-setup` command that downloads the required ASR model files to the local model directory.

#### Scenario: User runs setup command with no existing models
- **WHEN** the user runs `/transcribe-setup` and no model files exist locally
- **THEN** the system SHALL download the default streaming model archive from the sherpa-onnx GitHub releases
- **AND** SHALL extract the model files to the model directory (default: `~/.pi-transcribe/models/`)
- **AND** SHALL verify that the required files (encoder, decoder, joiner, tokens) are present
- **AND** SHALL notify the user of success

#### Scenario: User runs setup command with models already present
- **WHEN** the user runs `/transcribe-setup` and model files already exist
- **THEN** the system SHALL notify the user that models are already installed
- **AND** SHALL offer to re-download if the user confirms

#### Scenario: Model download fails
- **WHEN** the model download fails due to network error
- **THEN** the system SHALL display an error notification with the failure reason
- **AND** SHALL not leave partially downloaded files in the model directory

### Requirement: Cleanup on session shutdown
The system SHALL release all sherpa-onnx resources (recognizer, stream) when the Pi session ends.

#### Scenario: Pi session shuts down while model is loaded
- **WHEN** the Pi session emits `session_shutdown` and the recognizer is loaded
- **THEN** the system SHALL destroy the OnlineRecognizer and OnlineStream instances
- **AND** SHALL free associated memory

#### Scenario: Pi session shuts down while recording is active
- **WHEN** the Pi session emits `session_shutdown` while recording is in progress
- **THEN** the system SHALL stop the audio capture first
- **AND** SHALL then destroy the recognizer resources

### Requirement: Configurable endpoint detection sensitivity
The system SHALL allow configuration of sherpa-onnx's endpoint detection rules to tune dictation responsiveness.

#### Scenario: User configures endpoint sensitivity
- **WHEN** the extension loads and endpoint detection settings are configured
- **THEN** the system SHALL apply the configured values for `rule1MinTrailingSilence`, `rule2MinTrailingSilence`, and `rule3MinUtteranceLength` to the OnlineRecognizer configuration

#### Scenario: Default endpoint settings applied when unconfigured
- **WHEN** no custom endpoint settings are configured
- **THEN** the system SHALL use sherpa-onnx default values (rule1: 2.4s, rule2: 1.2s, rule3: 20s)
