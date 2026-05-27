declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
  abstract process(inputs: Float32Array[][]): boolean
}

declare function registerProcessor(
  name: string,
  processorCtor: new () => AudioWorkletProcessor
): void

class PCMProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0]
    if (input && input.length > 0) {
      this.port.postMessage(input.slice())
    }
    return true
  }
}

registerProcessor('pcm-processor', PCMProcessor)

export {}