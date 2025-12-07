/**
 * AnimationSettings - Feature component for animation configuration
 * Allows users to preview different animation styles
 */

import { Settings } from 'lucide-react';
import { Label } from '@/components/ui/Label/Label';

export type AnimationType = 'fade' | 'slide-up' | 'slide-down' | 'scale-center' | 'scale-left' | 'scale-right' | 'flip';

export interface AnimationConfig {
  type: AnimationType;
  showOverlay: boolean;
}

export interface AnimationSettingsProps {
  config: AnimationConfig;
  onChange: (config: AnimationConfig) => void;
}

const animationDescriptions: Record<AnimationType, string> = {
  'fade': 'Simple fade in',
  'slide-up': 'Slide from bottom',
  'slide-down': 'Slide from top',
  'scale-center': 'Scale from center',
  'scale-left': 'Scale from left',
  'scale-right': 'Scale from right',
  'flip': 'Flip card effect',
};

export function AnimationSettings({ config, onChange }: AnimationSettingsProps) {
  const handleAnimationChange = (type: AnimationType) => {
    onChange({ ...config, type });
  };

  const handleOverlayChange = (showOverlay: boolean) => {
    onChange({ ...config, showOverlay });
  };

  return (
    <div className="bg-card border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Settings className="h-4 w-4" />
        Animation Settings
      </div>

      {/* Animation Type */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Animation Style</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {(Object.keys(animationDescriptions) as AnimationType[]).map((type) => (
            <label
              key={type}
              className={`
                flex items-center gap-2 p-3 border rounded-md cursor-pointer transition-colors
                ${config.type === type
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50'
                }
              `}
            >
              <input
                type="radio"
                name="animation-type"
                value={type}
                checked={config.type === type}
                onChange={() => handleAnimationChange(type)}
                className="w-4 h-4 text-primary"
              />
              <div className="flex flex-col">
                <span className="text-sm font-medium capitalize">
                  {type.replace(/-/g, ' ')}
                </span>
                <span className="text-xs text-muted-foreground">
                  {animationDescriptions[type]}
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Overlay Toggle */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Loading Effect</Label>
        <div className="grid grid-cols-2 gap-2">
          <label
            className={`
              flex items-center gap-2 p-3 border rounded-md cursor-pointer transition-colors
              ${config.showOverlay
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
              }
            `}
          >
            <input
              type="radio"
              name="overlay"
              checked={config.showOverlay}
              onChange={() => handleOverlayChange(true)}
              className="w-4 h-4 text-primary"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium">With Overlay</span>
              <span className="text-xs text-muted-foreground">Blur background</span>
            </div>
          </label>
          <label
            className={`
              flex items-center gap-2 p-3 border rounded-md cursor-pointer transition-colors
              ${!config.showOverlay
                ? 'border-primary bg-primary/10'
                : 'border-border hover:border-primary/50'
              }
            `}
          >
            <input
              type="radio"
              name="overlay"
              checked={!config.showOverlay}
              onChange={() => handleOverlayChange(false)}
              className="w-4 h-4 text-primary"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium">No Overlay</span>
              <span className="text-xs text-muted-foreground">Direct animation</span>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
}
