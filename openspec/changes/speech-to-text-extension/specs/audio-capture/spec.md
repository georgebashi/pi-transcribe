## ADDED Requirements

### Requirement: Start audio capture on hotkey activation
The system SHALL begin capturing microphone audio when the user activates the dictation hotkey (default: `ctrl+shift+r`). Audio SHALL be captured as mono PCM float32 samples at 16kHz sample rate via naudiodon2/PortAudio.

#### Scenario: User presses hotkey to start recording
- **WHEN** the user presses `ctrl+shift+r` and the transcription engine is ready
- **THEN** the system opens a PortAudio input stream (mono, 16kHz, float32) and begins delivering audio sample buffers

#### Scenario: User presses hotkey but engine is not ready
- **WHEN** the user presses `ctrl+shift+r` and no ASR model is loaded
- **THEN** the system SHALL display a notification directing the user to run `/transcribe-setup`
- **AND** SHALL NOT attempt to open the microphone

### Requirement: Stop audio capture on hotkey deactivation
The system SHALL stop capturing microphone audio when the user deactivates the dictation hotkey. In toggle mode (primary), pressing the hotkey again stops recording. The PortAudio input stream SHALL be closed when recording stops.

#### Scenario: User presses hotkey again to stop recording (toggle mode)
- **WHEN** the system is currently recording and the user presses `ctrl+shift+r`
- **THEN** the system SHALL stop the PortAudio input stream
- **AND** SHALL signal the transcription engine to finalize any remaining audio

#### Scenario: User presses Escape to cancel recording
- **WHEN** the system is currently recording and the user presses `Escape`
- **THEN** the system SHALL stop the PortAudio input stream
- **AND** SHALL discard any uncommitted partial transcription text
- **AND** SHALL restore the editor to its pre-recording state

### Requirement: Buffer audio samples for streaming delivery
The system SHALL buffer incoming audio samples from PortAudio and deliver them to the transcription engine in chunks suitable for real-time streaming. Audio data SHALL be delivered as Float32Array samples.

#### Scenario: Audio data arrives from microphone
- **WHEN** the PortAudio `data` event fires with a buffer of audio samples
- **THEN** the system SHALL convert the buffer to Float32Array
- **AND** SHALL forward the samples to the transcription engine's `acceptWaveform` method

### Requirement: Handle microphone permission errors
The system SHALL detect and report microphone access errors gracefully, particularly macOS microphone permission denials.

#### Scenario: Microphone permission denied on macOS
- **WHEN** the user activates the hotkey and the system attempts to open the microphone
- **AND** the operating system denies microphone access
- **THEN** the system SHALL display a notification explaining the permission issue
- **AND** SHALL include guidance to check System Settings → Privacy → Microphone

#### Scenario: No audio input device available
- **WHEN** the user activates the hotkey and no audio input device is detected
- **THEN** the system SHALL display a notification indicating no microphone was found
- **AND** SHALL NOT crash or leave the extension in a broken state

### Requirement: Prevent concurrent recording sessions
The system SHALL ensure only one recording session is active at a time.

#### Scenario: User presses hotkey while already recording
- **WHEN** the system is currently recording and the user presses `ctrl+shift+r`
- **THEN** the system SHALL stop the current recording session (toggle behavior)
- **AND** SHALL NOT start a second concurrent recording
