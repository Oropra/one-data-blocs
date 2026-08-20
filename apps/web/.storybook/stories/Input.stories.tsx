import type { Meta, StoryObj } from '@storybook/react-vite';
import { Input } from '@one-data/design-system';

const meta: Meta<typeof Input> = {
  title: 'Design System/Input',
  component: Input,
  args: { label: 'Email', placeholder: 'prenom.nom@exemple.fr' },
};
export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {};
export const WithHint: Story = { args: { hint: 'Format attendu : prenom.nom@exemple.fr' } };
export const WithError: Story = { args: { error: 'Email invalide', defaultValue: 'pas-un-email' } };
export const Disabled: Story = { args: { disabled: true } };
