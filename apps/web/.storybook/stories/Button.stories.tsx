import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@one-data/design-system';

const meta: Meta<typeof Button> = {
  title: 'Design System/Button',
  component: Button,
  args: { children: 'Enregistrer' },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Danger: Story = { args: { variant: 'danger' } };
export const Ghost: Story = { args: { variant: 'ghost' } };
export const Disabled: Story = { args: { disabled: true } };
export const Small: Story = { args: { size: 'sm' } };
export const Large: Story = { args: { size: 'lg' } };
