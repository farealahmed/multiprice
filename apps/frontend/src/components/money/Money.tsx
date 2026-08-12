/** @jsxRuntime automatic */
/** @jsxImportSource react */
import { formatMoney } from './format-money';
import styles from './money.module.css';

type MoneyProps = {
  value: number;
  className?: string;
};

/** Renders a server-computed money value: 2dp, tabular numerals, nothing else. */
export function Money({ value, className }: MoneyProps) {
  const classes = className === undefined ? styles.money : `${styles.money} ${className}`;
  return <span className={classes}>{formatMoney(value)}</span>;
}
