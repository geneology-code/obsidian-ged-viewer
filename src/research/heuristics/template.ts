export const DEFAULT_RULES_YAML = `# Правила подбора источников для генеалогического исследования
# Документация по формату: https://github.com/geneology-code/obsidian-gedcom
#
# Структура:
#   rules:
#     - when: <условие>
#       source: "Название источника"   # необязательно
#       rules: [...]                   # вложенные правила, необязательно
#
# Условия (листовые):
#   place_includes: 'строка'           — любое место содержит подстроку
#   place_includes_any: ['а', 'б']     — любое место содержит хотя бы одну строку
#   birth_place_includes: 'строка'     — только место рождения
#   death_place_includes: 'строка'     — только место смерти
#   born_before: 1900                  — год рождения < значения
#   born_after: 1700                   — год рождения > значения
#   born_between: [1800, 1900]         — год рождения в диапазоне
#   died_before: 1950                  — год смерти < значения
#   died_after: 1800                   — год смерти > значения
#   alive_in: 1858                     — жил в этот год
#   alive_in_range: [1914, 1918]       — жизнь пересекается с периодом
#   sex: M                             — мужского пола (или F)
#   has_dates: true                    — есть хотя бы одна дата
#   has_birth_place: true              — место рождения заполнено
#
# Комбинаторы:
#   all: [условие, ...]                — все условия (AND)
#   any: [условие, ...]                — хотя бы одно (OR)
#   not: условие                       — отрицание

rules:
  - when:
      place_includes_any: ['Россия', 'Российская', 'РСФСР', 'Russia', 'USSR', 'Soviet']
    rules:
      - when:
          alive_in: 1858
        source: "10-я ревизия (1858)"
      - when:
          alive_in: 1834
        source: "9-я ревизия (1834)"
      - when:
          alive_in: 1816
        source: "8-я ревизия (1816)"
      - when:
          alive_in: 1795
        source: "5-я ревизия (1795)"
      - when:
          born_before: 1917
        source: "Метрические книги"
      - when:
          born_before: 1917
        source: "Исповедные ведомости"
      - when:
          all:
            - sex: M
            - born_before: 1917
        source: "Рекрутские наборы"
      - when:
          born_before: 1897
        source: "I Всероссийская перепись (1897)"
`;
