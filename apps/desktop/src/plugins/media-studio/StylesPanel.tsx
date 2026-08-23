/** LoRA styles on supported Krea 2 models: a chip row under the prompt
 *  accepting the user's available styles plus a strength per style, and a
 *  style-picker choices list fed from GET /styles. Only rendered when the
 *  active model declares styles support. */
import { Button } from '@hermes/plugin-sdk'
import { useCallback, useEffect, useState } from 'react'

import { listKreaStyles, trainKreaStyle } from './api'
import { useStudio } from './i18n'

interface StyleChoice { id: string; name: string }

interface Props {
  /** Picked styles live on the parent: reuses the create-panel flow and stays
      out of re-render churn. */
  styles: Array<{ id: string; strength: number }>
  onChange: (styles: Array<{ id: string; strength: number }>) => void
}

export function StylesPanel({ styles, onChange }: Props) {
  const k = useStudio()
  const [choices, setChoices] = useState<StyleChoice[]>([])
  const [trainingName, setTrainingName] = useState('')
  const [trainingUrls, setTrainingUrls] = useState('')
  const [training, setTraining] = useState(false)
  const [trainError, setTrainError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const data = await listKreaStyles()
      setChoices((data.styles || []).map((s: any) => ({ id: s.id, name: s.name || s.id })))
    } catch {
      setChoices([])
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const add = (id: string) => {
    if (!id || styles.some(s => s.id === id)) return
    onChange([...styles, { id, strength: 0.6 }])
  }

  const remove = (id: string) => onChange(styles.filter(s => s.id !== id))

  const setStrength = (id: string, strength: number) =>
    onChange(styles.map(s => s.id === id ? { ...s, strength } : s))

  const submitTrain = async () => {
    if (!trainingName.trim()) return
    const urls = trainingUrls.split('\n').map(u => u.trim()).filter(Boolean)
    if (urls.length === 0) { setTrainError('At least one training image URL'); return }
    setTrainError('')
    setTraining(true)
    try {
      await trainKreaStyle({ name: trainingName.trim(), urls })
      setTrainingName('')
      setTrainingUrls('')
      void refresh()
    } catch (e) {
      setTrainError(String(e))
    } finally {
      setTraining(false)
    }
  }

  const picked = styles.length > 0

  return (
    <div className="flex flex-col gap-3">
      {choices.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[10px] uppercase tracking-wider text-(--ui-text-quaternary)">{k.styles}</span>
          <div className="flex flex-wrap gap-1.5">
            {choices.map(c => {
              const active = styles.some(s => s.id === c.id)
              return (
                <button
                  className={`rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${active ? 'border-(--dt-primary) bg-(--ctx-primary-subtle) text-foreground' : 'border-(--ui-stroke-secondary) text-(--ui-text-secondary) hover:border-(--ui-stroke-primary)'}`}
                  key={c.id}
                  onClick={() => active ? remove(c.id) : add(c.id)}
                  type="button"
                >
                  {c.name}
                </button>
              )
            })}
          </div>
          {picked && (
            <div className="flex flex-col gap-1.5">
              {styles.map(s => {
                const name = choices.find(c => c.id === s.id)?.name ?? s.id
                return (
                  <div className="flex items-center gap-2" key={s.id}>
                    <span className="min-w-0 flex-1 truncate text-[12px]">{name}</span>
                    <input
                      aria-label={k.styleStrengthLabel}
                      className="w-24"
                      max={2}
                      min={0}
                      onChange={e => setStrength(s.id, Number(e.target.value))}
                      step={0.05}
                      type="range"
                      value={s.strength}
                    />
                    <span className="w-9 text-right text-[11px] text-(--ui-text-tertiary)">{s.strength.toFixed(2)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Train form: several hosted asset URLs + a name. */}
      <div className="flex flex-col gap-2 rounded-lg border border-(--ui-stroke-secondary) p-3">
        <span className="text-[10px] uppercase tracking-wider text-(--ui-text-quaternary)">{k.trainStyle}</span>
        <input
          className="rounded-md border border-(--ui-stroke-secondary) bg-transparent px-2 py-1.5 text-[12px]"
          onChange={e => setTrainingName(e.target.value)}
          placeholder={k.trainStyleNamePlaceholder}
          value={trainingName}
        />
        <textarea
          className="min-h-[64px] rounded-md border border-(--ui-stroke-secondary) bg-transparent p-2 text-[12px]"
          onChange={e => setTrainingUrls(e.target.value)}
          placeholder={k.trainStyleUrlsPlaceholder}
          value={trainingUrls}
        />
        {trainError && <span className="text-[11px] text-destructive">{trainError}</span>}
        <Button disabled={training} onClick={submitTrain} size="sm" variant="outline">
          {training ? k.trainInProgress : k.trainStyle}
        </Button>
      </div>
    </div>
  )
}
