const React = require('react');

const Select = React.forwardRef(({ children, ...props }, ref) => (
  <div ref={ref} {...props}>
    {children}
  </div>
));
Select.displayName = 'Select';

const SelectTrigger = React.forwardRef(({ children, ...props }, ref) => (
  <button ref={ref} {...props}>
    {children}
  </button>
));
SelectTrigger.displayName = 'SelectTrigger';

const SelectValue = React.forwardRef((props, ref) => <span ref={ref} {...props} />);
SelectValue.displayName = 'SelectValue';

const SelectContent = React.forwardRef(({ children, ...props }, ref) => (
  <div ref={ref} {...props}>
    {children}
  </div>
));
SelectContent.displayName = 'SelectContent';

const SelectItem = React.forwardRef(({ children, ...props }, ref) => (
  <div ref={ref} {...props}>
    {children}
  </div>
));
SelectItem.displayName = 'SelectItem';

const SelectViewport = React.forwardRef(({ children, ...props }, ref) => (
  <div ref={ref} {...props}>
    {children}
  </div>
));
SelectViewport.displayName = 'SelectViewport';

const SelectItemText = React.forwardRef(({ children, ...props }, ref) => (
  <span ref={ref} {...props}>
    {children}
  </span>
));
SelectItemText.displayName = 'SelectItemText';

const SelectPortal = ({ children }) => children;
SelectPortal.displayName = 'SelectPortal';

const SelectLabel = React.forwardRef(({ children, ...props }, ref) => (
  <label ref={ref} {...props}>
    {children}
  </label>
));
SelectLabel.displayName = 'SelectLabel';

const SelectSeparator = React.forwardRef((props, ref) => (
  <hr ref={ref} {...props} />
));
SelectSeparator.displayName = 'SelectSeparator';

module.exports = {
  Root: Select,
  Trigger: SelectTrigger,
  Value: SelectValue,
  Content: SelectContent,
  Item: SelectItem,
  Viewport: SelectViewport,
  ItemText: SelectItemText,
  Portal: SelectPortal,
  Label: SelectLabel,
  Separator: SelectSeparator,
};