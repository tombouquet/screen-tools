import { Captions, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChoiceTiles } from '@/components/choice-tiles';
import { ConfirmDeleteDialog } from '@/components/confirm-dialog';
import { OptionSelect } from '@/components/option-select';
import { SectionHeader, SettingGroup, SettingRow } from '@/components/settings/layout';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/formats';
import { updateSettings, type Settings } from '@/lib/settings';
import { deleteModels, modelCacheBytes, pickDevice } from '@/lib/transcribe/client';
import {
  MODELS,
  TRANSCRIPTION_LANGUAGES,
  TRANSCRIPTION_MODELS,
  type TranscriptionDevice,
  type TranscriptionLanguage,
  type TranscriptionModel,
} from '@/lib/transcribe/models';

export function TranscriptionSection({ settings }: { settings: Settings }) {
  const [device, setDevice] = useState<TranscriptionDevice>();
  const [bytes, setBytes] = useState<number>();
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    void pickDevice().then(setDevice);
    void modelCacheBytes().then(setBytes);
  }, []);

  const remove = async () => {
    await deleteModels();
    setBytes(await modelCacheBytes());
    toast.success('Speech model deleted', { description: "It's downloaded again the next time you transcribe." });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        icon={Captions}
        title="Transcription"
        description="Turn speech in a video into a timed transcript and captions, on your computer."
      />

      <SettingGroup
        title="Speech model"
        description={`Whisper runs in the browser${device ? ` on your ${device === 'webgpu' ? 'graphics card (WebGPU)' : 'processor (WebAssembly)'}` : ''}. It's downloaded once from Hugging Face the first time you transcribe; your audio never leaves your computer.`}
      >
        <ChoiceTiles<TranscriptionModel>
          label="Model size"
          value={settings.transcriptionModel}
          onChange={(transcriptionModel) => updateSettings({ transcriptionModel })}
          columns={3}
          choices={TRANSCRIPTION_MODELS.map((id) => ({
            value: id,
            label: MODELS[id].label,
            description: `${MODELS[id].description}. About ${MODELS[id].downloadMb[device ?? 'wasm']} MB.`,
          }))}
        />
        <SettingRow id="transcription-language" label="Spoken language" description="Picking it helps with short or quiet videos.">
          <OptionSelect<TranscriptionLanguage>
            id="transcription-language"
            items={TRANSCRIPTION_LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
            value={settings.transcriptionLanguage}
            onValueChange={(transcriptionLanguage) => updateSettings({ transcriptionLanguage })}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Downloaded models">
        <SettingRow
          label={bytes === undefined ? 'Checking…' : bytes ? `${formatBytes(bytes)} on this computer` : 'Nothing downloaded'}
          description="Deleting frees the space and gives back the Hugging Face permission. Transcripts you've made are kept."
        >
          <Button variant="outline" disabled={!bytes} onClick={() => setConfirmOpen(true)}>
            <Trash2 /> Delete downloaded model
          </Button>
        </SettingRow>
      </SettingGroup>

      <ConfirmDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void remove()}
        title="Delete the downloaded speech models?"
        description="Transcribing again downloads the model again. Transcripts you've made are kept."
      />
    </div>
  );
}
