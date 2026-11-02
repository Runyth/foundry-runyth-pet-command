# Learning Model

## XP awards

The default awards are:

| Outcome | XP |
|---|---:|
| Success | 0.25 |
| Failure | 1.00 |

Failure grants more XP because a failed attempt is treated as a larger training event. Both values are world-configurable and may be zero.

## Automatic obedience

Automatic obedience is a percentage from `0` to `100`:

```text
obedience = 100 × (1 - e ^ -((XP / scale) ^ shape))
```

The result is clamped and rounded.

Default values:

```text
scale = 40
shape = 1.2
```

At approximately `scale` XP, the relationship reaches about 63% automatic obedience. Increasing the scale slows progression. Increasing the shape makes early progress slower and later progress steeper.

## Command DC

The automatic or manual obedience percentage is interpolated between the configured worst and best DC:

```text
relationship base DC = maximum DC - (maximum DC - minimum DC) × obedience / 100
```

The command and current pet attitude then adjust that base:

```text
final command modifier = base command modifier + attitude modifier
final DC = relationship base DC + final command modifier
```

Defaults:

```text
best relationship base DC: 4
worst relationship base DC: 18
```

The final DC is rounded and clamped to `1–30`.

A negative modifier lowers the DC and is therefore easier. A positive modifier raises the DC and is therefore harder. For example, aggressive pets receive a large negative attitude modifier for **Attack**, but positive modifiers for restraint-oriented commands such as **Heel**, **Quiet**, and **Retreat**.

The command screen exposes every term rather than hiding attitude effects inside the final number.

## Manual override

The manual slider does not rewrite XP. It stores a nullable relationship field:

```json
{
  "manualObedience": 75
}
```

Resetting to automatic changes it back to:

```json
{
  "manualObedience": null
}
```

Changing the global learning curve immediately recalculates every automatic relationship while preserving XP and manual overrides.

## Bond labels

| Obedience | Label |
|---:|---|
| 0–19 | Unfamiliar |
| 20–39 | Tolerant |
| 40–59 | Familiar |
| 60–79 | Bonded |
| 80–100 | Devoted |

These labels are descriptive and do not add hidden mechanical modifiers.
