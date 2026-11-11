import { Label } from '@preview/shell/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@preview/shell/components/ui/select';
import { cn } from 'cn';
import { useId } from 'react';

type Option = { value: string; label: string; disabled?: boolean };

export type SelectFieldProps = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: readonly Option[];
  optionGroups?: readonly { label: string; options: readonly Option[] }[];
  disabled?: boolean;
  /** Put the label on its own row and give the trigger the panel's width, for long option labels. */
  wide?: boolean;
};

export function SelectField({
  id,
  label,
  value,
  onChange,
  options = [],
  optionGroups,
  disabled = false,
  wide = false,
}: SelectFieldProps) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const items = (values: readonly Option[]) =>
    values.map((option) => (
      <SelectItem key={option.value} value={option.value} disabled={option.disabled ?? false}>
        {option.label}
      </SelectItem>
    ));

  return (
    <>
      <Label htmlFor={triggerId} className={cn('text-muted-foreground shrink-0 font-normal', wide && 'col-span-2')}>
        {label}
      </Label>
      <Select
        items={[...options, ...(optionGroups?.flatMap((group) => group.options) ?? [])]}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={triggerId} size="default" className={cn(wide && 'col-span-2 w-full min-w-0')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optionGroups ? (
            optionGroups.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {items(group.options)}
              </SelectGroup>
            ))
          ) : (
            <SelectGroup>{items(options)}</SelectGroup>
          )}
        </SelectContent>
      </Select>
    </>
  );
}
