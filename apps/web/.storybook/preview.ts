import type { Preview } from '@storybook/react-vite';
import '@one-data/design-system/tokens.css';
import '@one-data/design-system/components.css';

const preview: Preview = {
  parameters: {
    controls: { expanded: true },
  },
};

export default preview;
