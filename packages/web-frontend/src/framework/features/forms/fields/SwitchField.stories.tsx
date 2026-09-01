import { useState } from 'react';

import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';

import { SwitchField } from './SwitchField';

/**
 * SwitchField is a complete form field with label, switch, and error display.
 * Wraps SwitchInput to provide full form integration.
 *
 * Features:
 * - Label with optional required indicator
 * - Optional description text
 * - Error message display
 * - Better for boolean toggles than checkbox
 * - Label positioned inline with switch
 */
const meta = {
	title: 'Features/Form/Fields/SwitchField',
	component: SwitchField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
} satisfies Meta<typeof SwitchField>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Default switch field (unchecked)
 */
export const Default: Story = {
	args: {
		label: 'Enable notifications',
		checked: false,
		onChange: fn(),
	},
};

/**
 * Checked switch field
 */
export const Checked: Story = {
	args: {
		label: 'Enable notifications',
		checked: true,
		onChange: fn(),
	},
};

/**
 * Required field with asterisk
 */
export const Required: Story = {
	args: {
		label: 'Accept terms and conditions',
		checked: false,
		onChange: fn(),
		required: true,
	},
};

/**
 * Field with description
 */
export const WithDescription: Story = {
	args: {
		label: 'Marketing emails',
		checked: false,
		onChange: fn(),
		description: 'Receive emails about new products, features, and more',
	},
};

/**
 * Field with error message
 */
export const WithError: Story = {
	args: {
		label: 'Accept terms',
		checked: false,
		onChange: fn(),
		required: true,
		error: 'You must accept the terms to continue',
	},
};

/**
 * Field with description and error
 */
export const WithDescriptionAndError: Story = {
	args: {
		label: 'Enable two-factor authentication',
		checked: false,
		onChange: fn(),
		description: 'Add an extra layer of security to your account',
		required: true,
		error: 'Two-factor authentication is required for this account type',
	},
};

/**
 * Interactive switch field
 */ export const Interactive: Story = {
	args: undefined as any,
	render: () => {
		const [checked, setChecked] = useState(false);

		return (
			<div className="w-96 space-y-4">
				<SwitchField
					label="Enable notifications"
					checked={checked}
					onChange={setChecked}
					description="Get notified about important updates"
				/>
				<p className="text-sm text-muted-foreground">
					Status: <strong>{checked ? 'Enabled' : 'Disabled'}</strong>
				</p>
			</div>
		);
	},
};

/**
 * Settings form with multiple switches
 */ export const SettingsForm: Story = {
	args: undefined as any,
	render: () => {
		const [settings, setSettings] = useState({
			notifications: true,
			marketing: false,
			newsletter: true,
			updates: false,
		});

		const updateSetting = (key: keyof typeof settings, value: boolean) => {
			setSettings(prev => ({ ...prev, [key]: value }));
		};

		return (
			<div className="w-96 space-y-6 rounded-lg border border-border p-6">
				<h3 className="text-lg font-medium">Email Preferences</h3>

				<div className="space-y-4">
					<SwitchField
						label="Email notifications"
						checked={settings.notifications}
						onChange={value => updateSetting('notifications', value)}
						description="Receive notifications about your account activity"
					/>

					<SwitchField
						label="Marketing communications"
						checked={settings.marketing}
						onChange={value => updateSetting('marketing', value)}
						description="Receive emails about promotions and special offers"
					/>

					<SwitchField
						label="Newsletter"
						checked={settings.newsletter}
						onChange={value => updateSetting('newsletter', value)}
						description="Get our weekly newsletter with tips and updates"
					/>

					<SwitchField
						label="Product updates"
						checked={settings.updates}
						onChange={value => updateSetting('updates', value)}
						description="Be the first to know about new features"
					/>
				</div>

				// violations-suppress: react/no-raw-button story fixture
				<button
					className={`
       w-full rounded-md bg-primary px-4 py-2 text-primary-foreground
       hover:bg-primary/90
     `}
					onClick={() => alert(JSON.stringify(settings, null, 2))}
				>
					Save preferences
				</button>
			</div>
		);
	},
};

/**
 * Privacy settings
 */ export const PrivacySettings: Story = {
	args: undefined as any,
	render: () => {
		const [publicProfile, setPublicProfile] = useState(true);
		const [showEmail, setShowEmail] = useState(false);
		const [showActivity, setShowActivity] = useState(true);

		return (
			<div className="w-96 space-y-6 rounded-lg border border-border p-6">
				<div>
					<h3 className="text-lg font-medium">Privacy Settings</h3>
					<p className="text-sm text-muted-foreground">Control who can see your information</p>
				</div>

				<div className="space-y-4">
					<SwitchField
						label="Public profile"
						checked={publicProfile}
						onChange={setPublicProfile}
						description="Make your profile visible to everyone"
					/>

					<SwitchField
						label="Show email address"
						checked={showEmail}
						onChange={setShowEmail}
						description="Display your email on your profile"
					/>

					<SwitchField
						label="Show activity status"
						checked={showActivity}
						onChange={setShowActivity}
						description="Let others see when you're online"
					/>
				</div>
			</div>
		);
	},
};

/**
 * Form with validation
 */ export const FormWithValidation: Story = {
	args: undefined as any,
	render: () => {
		const [acceptTerms, setAcceptTerms] = useState(false);
		const [acceptPrivacy, setAcceptPrivacy] = useState(false);
		const [error, setError] = useState('');

		const handleSubmit = (e: React.FormEvent) => {
			e.preventDefault();
			if (!acceptTerms || !acceptPrivacy) {
				setError('You must accept both terms and privacy policy');
			} else {
				setError('');
				alert('Form submitted successfully!');
			}
		};

		return (
			<form onSubmit={handleSubmit} className={`w-96 space-y-6 rounded-lg border border-border p-6`}>
				<h3 className="text-lg font-medium">Create Account</h3>

				<div className="space-y-4">
					<SwitchField
						label="Accept terms and conditions"
						checked={acceptTerms}
						onChange={value => {
							setAcceptTerms(value);
							setError('');
						}}
						description="I agree to the terms and conditions"
						required={true}
						error={!acceptTerms && error ? 'Required' : undefined}
					/>

					<SwitchField
						label="Accept privacy policy"
						checked={acceptPrivacy}
						onChange={value => {
							setAcceptPrivacy(value);
							setError('');
						}}
						description="I have read and accept the privacy policy"
						required={true}
						error={!acceptPrivacy && error ? 'Required' : undefined}
					/>
				</div>

				{error && <p className="text-sm text-destructive">{error}</p>}

				// violations-suppress: react/no-raw-button story fixture
				<button
					type="submit"
					className={`
       w-full rounded-md bg-primary px-4 py-2 text-primary-foreground
       hover:bg-primary/90
     `}
				>
					Create account
				</button>
			</form>
		);
	},
};

/**
 * Feature toggles
 */ export const FeatureToggles: Story = {
	args: undefined as any,
	render: () => {
		const [features, setFeatures] = useState({
			darkMode: false,
			compactView: true,
			autoSave: true,
			spellCheck: false,
		});

		const toggleFeature = (key: keyof typeof features, value: boolean) => {
			setFeatures(prev => ({ ...prev, [key]: value }));
		};

		return (
			<div className="w-96 space-y-6 rounded-lg border border-border p-6">
				<div>
					<h3 className="text-lg font-medium">Editor Settings</h3>
					<p className="text-sm text-muted-foreground">Customize your editing experience</p>
				</div>

				<div className="space-y-4">
					<SwitchField
						label="Dark mode"
						checked={features.darkMode}
						onChange={value => toggleFeature('darkMode', value)}
						description="Use dark theme for better readability"
					/>

					<SwitchField
						label="Compact view"
						checked={features.compactView}
						onChange={value => toggleFeature('compactView', value)}
						description="Show more content on screen"
					/>

					<SwitchField
						label="Auto-save"
						checked={features.autoSave}
						onChange={value => toggleFeature('autoSave', value)}
						description="Automatically save changes as you type"
					/>

					<SwitchField
						label="Spell check"
						checked={features.spellCheck}
						onChange={value => toggleFeature('spellCheck', value)}
						description="Check spelling while you type"
					/>
				</div>
			</div>
		);
	},
};

/**
 * Account security
 */ export const AccountSecurity: Story = {
	args: undefined as any,
	render: () => {
		const [twoFactor, setTwoFactor] = useState(false);
		const [loginAlerts, setLoginAlerts] = useState(true);
		const [sessionTimeout, setSessionTimeout] = useState(false);

		return (
			<div className="w-96 space-y-6 rounded-lg border border-border p-6">
				<div>
					<h3 className="text-lg font-medium">Security</h3>
					<p className="text-sm text-muted-foreground">Protect your account</p>
				</div>

				<div className="space-y-4">
					<SwitchField
						label="Two-factor authentication"
						checked={twoFactor}
						onChange={setTwoFactor}
						description="Require a code from your phone to sign in"
						required={false}
					/>

					<SwitchField
						label="Login alerts"
						checked={loginAlerts}
						onChange={setLoginAlerts}
						description="Get notified of new sign-ins to your account"
					/>

					<SwitchField
						label="Auto session timeout"
						checked={sessionTimeout}
						onChange={setSessionTimeout}
						description="Automatically sign out after 30 minutes of inactivity"
					/>
				</div>

				// violations-suppress: react/no-raw-button story fixture
				<button
					className={`
       w-full rounded-md bg-primary px-4 py-2 text-primary-foreground
       hover:bg-primary/90
     `}
					onClick={() => {
						if (!twoFactor) {
							alert('Consider enabling two-factor authentication for better security');
						} else {
							alert('Security settings saved');
						}
					}}
				>
					Save settings
				</button>
			</div>
		);
	},
};

/**
 * Validation states
 */ export const ValidationStates: Story = {
	args: undefined as any,
	render: () => {
		return (
			<div className="w-96 space-y-8">
				<div>
					<h4 className="mb-3 text-sm font-medium">Valid (checked)</h4>
					<SwitchField
						label="Accept terms"
						checked={true}
						onChange={() => {}}
						description="I agree to the terms and conditions"
						required={true}
					/>
				</div>

				<div>
					<h4 className="mb-3 text-sm font-medium">Error (required but unchecked)</h4>
					<SwitchField
						label="Accept terms"
						checked={false}
						onChange={() => {}}
						description="I agree to the terms and conditions"
						required={true}
						error="You must accept the terms to continue"
					/>
				</div>

				<div>
					<h4 className="mb-3 text-sm font-medium">Optional</h4>
					<SwitchField
						label="Subscribe to newsletter"
						checked={false}
						onChange={() => {}}
						description="Get weekly updates in your inbox"
					/>
				</div>
			</div>
		);
	},
};
