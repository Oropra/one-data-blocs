import type { Meta } from '@storybook/react-vite';
import { useState } from 'react';
import { Badge, Button, Dialog, Tabs, ToastProvider, useToast } from '@one-data/design-system';

export const Badges = {
  render: () => (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <Badge>Neutre</Badge>
      <Badge variant="success">Terminé</Badge>
      <Badge variant="warning">En attente</Badge>
      <Badge variant="danger">Échoué</Badge>
      <Badge variant="info">Info</Badge>
    </div>
  ),
};

export const TabsExample = {
  render: () => (
    <Tabs
      aria-label="Exemple"
      tabs={[
        { id: 'a', label: 'Profil', panel: <p>Contenu du profil</p> },
        { id: 'b', label: 'Contacts', panel: <p>Contenu des contacts</p> },
        { id: 'c', label: 'Désactivé', panel: null, disabled: true },
      ]}
    />
  ),
};

function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Ouvrir la boîte de dialogue
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Confirmer la suppression"
      >
        <p>Cette action est définitive.</p>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(false);
            }}
          >
            Annuler
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setOpen(false);
            }}
          >
            Supprimer
          </Button>
        </div>
      </Dialog>
    </>
  );
}

export const DialogExample = {
  render: () => <DialogDemo />,
};

function ToastDemoButton() {
  const { push } = useToast();
  return (
    <Button
      onClick={() => {
        push('Client enregistré', 'success');
      }}
    >
      Afficher un toast
    </Button>
  );
}

export const ToastExample = {
  render: () => (
    <ToastProvider>
      <ToastDemoButton />
    </ToastProvider>
  ),
};

const meta: Meta = { title: 'Design System/Composites' };
export default meta;
