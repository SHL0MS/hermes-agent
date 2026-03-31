from manim import *
import numpy as np

# === CONSTANTS ===
BG = "#0D1117"
PRIMARY = "#58C4DD"
SECONDARY = "#83C167"
ACCENT = "#FFFF00"
HIGHLIGHT = "#FF6B6B"
DIM = "#444455"
FONT = "SF Pro Display"
MONO = "Menlo"


class FourierDecomposition(Scene):
    """Decompose a square wave into its Fourier series components,
    showing how sine waves of increasing frequency sum to approximate it."""

    def construct(self):
        self.camera.background_color = BG

        # === TITLE ===
        title = Text("Fourier Series", font_size=48, color=PRIMARY, weight=BOLD, font=MONO)
        subtitle = Text("Building a square wave from sine waves", font_size=22, color=DIM, font=MONO)
        subtitle.next_to(title, DOWN, buff=0.3)
        self.play(Write(title), run_time=1.0)
        self.play(FadeIn(subtitle, shift=UP * 0.1), run_time=0.6)
        self.wait(1.5)
        self.play(FadeOut(Group(title, subtitle)), run_time=0.5)

        # === AXES ===
        axes = Axes(
            x_range=[0, 2 * PI, PI / 2],
            y_range=[-1.5, 1.5, 0.5],
            x_length=10,
            y_length=4.5,
            axis_config={"color": DIM, "stroke_width": 1.5, "include_numbers": False},
            tips=False,
        ).shift(DOWN * 0.3)

        # Custom x labels
        x_labels = Group(
            Text("0", font_size=18, color=DIM, font=MONO).next_to(axes.c2p(0, 0), DOWN, buff=0.2),
            Text("pi", font_size=18, color=DIM, font=MONO).next_to(axes.c2p(PI, 0), DOWN, buff=0.2),
            Text("2pi", font_size=18, color=DIM, font=MONO).next_to(axes.c2p(2 * PI, 0), DOWN, buff=0.2),
        )

        axes_label = Text("Fourier Approximation of a Square Wave", font_size=18, color=DIM, font=MONO)
        axes_label.to_edge(UP, buff=0.5)

        self.play(Create(axes), FadeIn(x_labels), FadeIn(axes_label), run_time=1.5)

        # === SQUARE WAVE (target) ===
        def square_wave(x):
            return 1.0 if (x % (2 * PI)) < PI else -1.0

        square_graph = axes.plot(
            square_wave,
            x_range=[0.001, 2 * PI - 0.001],
            discontinuities=[PI],
            dt=0.01,
            color=WHITE,
        ).set_stroke(width=2, opacity=0.4)

        target_label = Text("Target: square wave", font_size=18, color=WHITE, font=MONO)
        target_label.set_stroke(BLACK, width=3, background=True)
        target_label.next_to(axes.c2p(2 * PI, 1), RIGHT, buff=-1.5).shift(UP * 0.3)

        self.play(Create(square_graph), FadeIn(target_label), run_time=2.0)
        self.wait(1.0)

        # === FOURIER COMPONENTS ===
        n_terms = [1, 2, 3, 5, 9, 25]
        colors = [PRIMARY, SECONDARY, ACCENT, HIGHLIGHT, "#9B59B6", "#E67E22"]

        def fourier_sum(x, n_max):
            result = 0
            for k in range(n_max):
                n = 2 * k + 1  # odd harmonics only
                result += (4 / (n * PI)) * np.sin(n * x)
            return result

        # Show first sine wave alone
        sine1 = axes.plot(lambda x: (4 / PI) * np.sin(x), x_range=[0, 2 * PI], color=PRIMARY)
        sine1.set_stroke(width=2.5)

        sine_label = Text("n=1:  (4/pi) sin(x)", font_size=20, color=PRIMARY, font=MONO)
        sine_label.set_stroke(BLACK, width=3, background=True)
        sine_label.next_to(axes.c2p(PI / 2, 4 / PI), UP, buff=0.2)

        self.play(Create(sine1), FadeIn(sine_label), run_time=1.5)
        self.wait(1.0)

        # Counter display
        counter_label = Text("Terms: ", font_size=20, color=DIM, font=MONO)
        counter_value = Text("1", font_size=24, color=PRIMARY, weight=BOLD, font=MONO)
        counter = Group(counter_label, counter_value).arrange(RIGHT, buff=0.15)
        counter.to_corner(UR, buff=0.6)
        self.play(FadeIn(counter), run_time=0.4)

        # Progressive approximation
        current_graph = sine1
        current_color_idx = 0

        for i, n in enumerate(n_terms[1:], 1):
            new_graph = axes.plot(
                lambda x, n=n: fourier_sum(x, n),
                x_range=[0, 2 * PI],
                color=colors[min(i, len(colors) - 1)],
            ).set_stroke(width=2.5)

            new_counter = Text(str(n), font_size=24, color=colors[min(i, len(colors) - 1)], weight=BOLD, font=MONO)
            new_counter.move_to(counter_value)

            # Dim the old label on first transition
            if i == 1:
                self.play(
                    FadeOut(sine_label),
                    ReplacementTransform(current_graph, new_graph),
                    ReplacementTransform(counter_value, new_counter),
                    run_time=1.2,
                )
            else:
                self.play(
                    ReplacementTransform(current_graph, new_graph),
                    ReplacementTransform(counter_value, new_counter),
                    run_time=0.8 if n > 5 else 1.2,
                )

            current_graph = new_graph
            counter_value = new_counter
            self.wait(0.6 if n > 5 else 1.0)

        # === HIGHLIGHT CONVERGENCE ===
        self.play(
            current_graph.animate.set_stroke(width=3.5),
            square_graph.animate.set_stroke(opacity=0.7, width=2.5),
            run_time=0.8,
        )

        convergence_text = Text(
            "As terms increase, the approximation converges to the square wave",
            font_size=20, color=WHITE, font=MONO,
        )
        convergence_text.set_stroke(BLACK, width=3, background=True)
        convergence_text.to_edge(DOWN, buff=0.5)
        self.play(FadeIn(convergence_text, shift=UP * 0.1), run_time=0.8)
        self.wait(2.0)

        # === GIBBS PHENOMENON ===
        self.play(FadeOut(convergence_text), run_time=0.4)

        # Zoom into the overshoot at the discontinuity
        gibbs_arrow = Arrow(
            axes.c2p(PI - 0.8, 1.3), axes.c2p(PI - 0.15, 1.15),
            color=HIGHLIGHT, stroke_width=2, max_tip_length_to_length_ratio=0.2,
        )
        gibbs_label = Text("Gibbs phenomenon", font_size=20, color=HIGHLIGHT, font=MONO)
        gibbs_label.set_stroke(BLACK, width=3, background=True)
        gibbs_label.next_to(gibbs_arrow.get_start(), UP, buff=0.15)

        self.play(GrowArrow(gibbs_arrow), FadeIn(gibbs_label), run_time=1.0)
        self.wait(1.5)

        gibbs_note = Text(
            "~9% overshoot at discontinuities — persists no matter how many terms",
            font_size=18, color=HIGHLIGHT, font=MONO,
        )
        gibbs_note.set_stroke(BLACK, width=3, background=True)
        gibbs_note.to_edge(DOWN, buff=0.5)
        self.play(FadeIn(gibbs_note, shift=UP * 0.1), run_time=0.8)
        self.wait(2.5)

        # === CLOSING ===
        self.play(FadeOut(Group(*self.mobjects)), run_time=1.0)

        closing = Text("Fourier Analysis", font_size=44, color=PRIMARY, weight=BOLD, font=MONO)
        closing_sub = Text("Infinite sines, finite truth", font_size=20, color=DIM, font=MONO)
        closing_sub.next_to(closing, DOWN, buff=0.3)
        self.play(Write(closing), run_time=1.0)
        self.play(FadeIn(closing_sub, shift=UP * 0.1), run_time=0.6)
        self.wait(2.0)
        self.play(FadeOut(Group(*self.mobjects)), run_time=0.8)
