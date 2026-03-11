#!/usr/bin/env swift
//
// Apple Speech transcriber for pi-transcribe.
// Uses macOS SFSpeechRecognizer for on-device speech recognition.
// Requires: macOS 13+, Siri or Dictation enabled in System Settings.
//
// Usage: transcribe-apple <audio-file>
// Output: transcription text on stdout
// Exit codes: 0 = success, 2 = Siri/Dictation disabled, 1 = other error
//

import Foundation
import Speech

guard CommandLine.arguments.count > 1 else {
    fputs("Usage: transcribe-apple <audio-file>\n", stderr)
    exit(1)
}

let audioPath = CommandLine.arguments[1]
let audioURL = URL(fileURLWithPath: audioPath)

guard FileManager.default.fileExists(atPath: audioPath) else {
    fputs("Error: file not found: \(audioPath)\n", stderr)
    exit(1)
}

var resultCode: Int32 = 0
var didFinish = false

func doTranscribe() {
    SFSpeechRecognizer.requestAuthorization { status in
        DispatchQueue.main.async {
            guard status == .authorized else {
                fputs("Error: speech recognition not authorized (status: \(status.rawValue))\n", stderr)
                fputs("Enable in System Settings → Privacy & Security → Speech Recognition\n", stderr)
                resultCode = 1
                didFinish = true
                CFRunLoopStop(CFRunLoopGetMain())
                return
            }

            guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
                  recognizer.isAvailable else {
                fputs("Error: speech recognizer not available\n", stderr)
                resultCode = 1
                didFinish = true
                CFRunLoopStop(CFRunLoopGetMain())
                return
            }

            let request = SFSpeechURLRecognitionRequest(url: audioURL)
            if recognizer.supportsOnDeviceRecognition {
                request.requiresOnDeviceRecognition = true
            }
            request.shouldReportPartialResults = false

            recognizer.recognitionTask(with: request) { result, error in
                DispatchQueue.main.async {
                    if let error = error {
                        let msg = error.localizedDescription
                        fputs("Error: \(msg)\n", stderr)
                        // Exit 2 for Siri/Dictation disabled — lets auto-detect skip this backend
                        resultCode = msg.contains("Dictation") || msg.contains("Siri") ? 2 : 1
                        didFinish = true
                        CFRunLoopStop(CFRunLoopGetMain())
                        return
                    }

                    guard let result = result else { return }

                    if result.isFinal {
                        print(result.bestTranscription.formattedString)
                        resultCode = 0
                        didFinish = true
                        CFRunLoopStop(CFRunLoopGetMain())
                    }
                }
            }
        }
    }
}

DispatchQueue.main.async { doTranscribe() }

// Timeout
DispatchQueue.main.asyncAfter(deadline: .now() + 60) {
    if !didFinish {
        fputs("Error: transcription timed out\n", stderr)
        resultCode = 1
        CFRunLoopStop(CFRunLoopGetMain())
    }
}

CFRunLoopRun()
exit(resultCode)
