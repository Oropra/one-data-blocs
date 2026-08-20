import{j as e,a,T as d,b as c,B as i,D as p,u}from"./Toast-BR7c8Phb.js";import{r as m}from"./iframe-BAXO6sWd.js";import"./preload-helper-PPVm8Dsz.js";const s={render:()=>e.jsxs("div",{style:{display:"flex",gap:"0.5rem"},children:[e.jsx(a,{children:"Neutre"}),e.jsx(a,{variant:"success",children:"Terminé"}),e.jsx(a,{variant:"warning",children:"En attente"}),e.jsx(a,{variant:"danger",children:"Échoué"}),e.jsx(a,{variant:"info",children:"Info"})]})},n={render:()=>e.jsx(d,{"aria-label":"Exemple",tabs:[{id:"a",label:"Profil",panel:e.jsx("p",{children:"Contenu du profil"})},{id:"b",label:"Contacts",panel:e.jsx("p",{children:"Contenu des contacts"})},{id:"c",label:"Désactivé",panel:null,disabled:!0}]})};function x(){const[l,r]=m.useState(!1);return e.jsxs(e.Fragment,{children:[e.jsx(i,{onClick:()=>{r(!0)},children:"Ouvrir la boîte de dialogue"}),e.jsxs(p,{open:l,onClose:()=>{r(!1)},title:"Confirmer la suppression",children:[e.jsx("p",{children:"Cette action est définitive."}),e.jsxs("div",{style:{display:"flex",gap:"0.5rem",justifyContent:"flex-end"},children:[e.jsx(i,{variant:"secondary",onClick:()=>{r(!1)},children:"Annuler"}),e.jsx(i,{variant:"danger",onClick:()=>{r(!1)},children:"Supprimer"})]})]})]})}const t={render:()=>e.jsx(x,{})};function g(){const{push:l}=u();return e.jsx(i,{onClick:()=>{l("Client enregistré","success")},children:"Afficher un toast"})}const o={render:()=>e.jsx(c,{children:e.jsx(g,{})})},v={title:"Design System/Composites"};s.parameters={...s.parameters,docs:{...s.parameters?.docs,source:{originalSource:`{
  render: () => <div style={{
    display: 'flex',
    gap: '0.5rem'
  }}>
      <Badge>Neutre</Badge>
      <Badge variant="success">Terminé</Badge>
      <Badge variant="warning">En attente</Badge>
      <Badge variant="danger">Échoué</Badge>
      <Badge variant="info">Info</Badge>
    </div>
}`,...s.parameters?.docs?.source}}};n.parameters={...n.parameters,docs:{...n.parameters?.docs,source:{originalSource:`{
  render: () => <Tabs aria-label="Exemple" tabs={[{
    id: 'a',
    label: 'Profil',
    panel: <p>Contenu du profil</p>
  }, {
    id: 'b',
    label: 'Contacts',
    panel: <p>Contenu des contacts</p>
  }, {
    id: 'c',
    label: 'Désactivé',
    panel: null,
    disabled: true
  }]} />
}`,...n.parameters?.docs?.source}}};t.parameters={...t.parameters,docs:{...t.parameters?.docs,source:{originalSource:`{
  render: () => <DialogDemo />
}`,...t.parameters?.docs?.source}}};o.parameters={...o.parameters,docs:{...o.parameters?.docs,source:{originalSource:`{
  render: () => <ToastProvider>
      <ToastDemoButton />
    </ToastProvider>
}`,...o.parameters?.docs?.source}}};const b=["Badges","TabsExample","DialogExample","ToastExample"];export{s as Badges,t as DialogExample,n as TabsExample,o as ToastExample,b as __namedExportsOrder,v as default};
